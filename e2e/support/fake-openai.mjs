// Local stand-in for OpenAI, for the browser smoke tests only (never used in production):
// embeddings, chat completions with canned edit/explain answers. Port: FAKE_OPENAI_PORT (5600).
import http from "node:http";
const stem = (w) =>
  w.length > 4 && w.endsWith("ies")
    ? w.slice(0, -3) + "y"
    : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")
      ? w.slice(0, -1)
      : w;
const words = (t) =>
  t
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
function vec(text, dims) {
  const v = new Array(dims).fill(0);
  for (const w of words(text).map(stem)) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619);
    v[Math.abs(h) % dims] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}
const EDIT = `SUMMARY: Added a glowing pink "Remixed with REMAXX" badge in the bottom-right corner.

<<<EDIT path="index.html">>>
<<<<<<< SEARCH
</body>
=======
<div style="position:fixed;bottom:18px;right:18px;background:#ff3dcb;color:#0f0d1e;padding:10px 16px;border-radius:999px;font:700 14px system-ui;box-shadow:0 0 24px #ff3dcb99">Remixed with REMAXX ✦</div>
</body>
>>>>>>> REPLACE
<<<END>>>`;
const EXPLAIN = `## What it is
A soft, pastel landing page for a late-night coffee van, with a menu and a "text me when you park" button.

## What it's built with
- **HTML** for the structure: header, menu cards and footer.
- **CSS** for the pastel colors, rounded cards and the \`grid\` layout of the menu.

## The files
- \`index.html\` holds everything: markup, styles in a \`<style>\` tag, and a short script.

## How it works
1. The page loads and the browser draws the header and menu.
2. Menu items sit in a CSS grid, so they wrap neatly on phones.

## Ideas to remix
- "Change the menu to a taco truck menu"
- "Make it dark mode with neon accents"
- "Add a map section showing where the van parks"`;
http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const j = JSON.parse(body || "{}");
      res.setHeader("content-type", "application/json");
      if (req.url === "/health") return res.end('{"ok":true}');
      if (req.url.endsWith("/embeddings")) {
        const input = Array.isArray(j.input) ? j.input : [j.input];
        res.end(
          JSON.stringify({
            data: input.map((t, index) => ({ index, embedding: vec(t, j.dimensions ?? 1536) })),
          }),
        );
      } else if (req.url.endsWith("/chat/completions")) {
        const sys = j.messages?.[0]?.content ?? "";
        const text = /explain how small websites work/.test(sys)
          ? EXPLAIN
          : /building assistant/.test(sys)
            ? EDIT
            : "A test description from the local stand-in.";
        setTimeout(
          () =>
            res.end(
              JSON.stringify({
                choices: [{ message: { content: text }, finish_reason: "stop" }],
                usage: { prompt_tokens: 3200, completion_tokens: 140 },
              }),
            ),
          1200,
        );
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
  })
  .listen(Number(process.env.FAKE_OPENAI_PORT ?? 5600), "127.0.0.1", () =>
    console.log("fake openai ready"),
  );
