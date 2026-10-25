import { describe, expect, it } from "vitest";
import { bundleForPreview, resolveRef, rewriteCssUrls } from "@/lib/editor/bundle";

const PNG = "data:image/png;base64,AAAA";

describe("resolveRef", () => {
  it.each([
    ["index.html", "style.css", "style.css"],
    ["pages/about.html", "../img/a.png", "img/a.png"],
    ["pages/about.html", "/img/a.png", "img/a.png"],
    ["index.html", "./js/app.js?v=2#x", "js/app.js"],
    ["index.html", "../../../etc/passwd", "etc/passwd"],
    ["index.html", "my%20pic.png", "my pic.png"],
  ])("%s + %s → %s", (from, ref, out) => {
    expect(resolveRef(from, ref)).toBe(out);
  });
  it("leaves external URLs alone", () => {
    for (const ref of [
      "https://cdn.example/x.js",
      "//cdn.example/x.js",
      "data:image/png;base64,A",
      "mailto:a@b.c",
      "",
    ]) {
      expect(resolveRef("index.html", ref)).toBeNull();
    }
  });
});

describe("bundleForPreview", () => {
  const input = {
    entryPath: "index.html",
    text: {
      "index.html": `<!doctype html><html><head>
<link rel="stylesheet" href="css/style.css">
<link rel="icon" href="img/logo.svg">
<script src="js/early.js"></script>
<script defer src="js/app.js"></script>
<script src="https://cdn.example/lib.js"></script>
</head><body style="background:url(img/bg.png)">
<img src="img/hero.png" alt=""><a href="about.html">About</a>
</body></html>`,
      "css/style.css": "body{background:url('../img/bg.png')} .x{content:'</style>'}",
      "js/early.js": "window.early = 1;",
      "js/app.js": "document.title = 'app'; var s = '</script>';",
      "img/logo.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>',
      "data.json": '{"a":1}',
      "about.html": "<h1>About</h1>",
    },
    assets: { "img/bg.png": PNG, "img/hero.png": PNG },
  };
  const out = bundleForPreview(input);

  it("inlines local CSS with its image URLs resolved, and escapes closing tags", () => {
    expect(out).toContain('<style data-file="css/style.css">');
    expect(out).toContain(`url("${PNG}")`);
    expect(out).toContain("content:'<\\/style>'");
    expect(out).not.toContain('href="css/style.css"');
  });

  it("inlines scripts, keeps external ones, and moves deferred ones after the page", () => {
    expect(out).toContain('<script data-file="js/early.js">\nwindow.early = 1;');
    expect(out).toContain('<script src="https://cdn.example/lib.js"></script>');
    expect(out).toContain("var s = '<\\/script>'");
    expect(out.indexOf('data-file="js/app.js"')).toBeGreaterThan(out.indexOf("<a href"));
    expect(out).not.toMatch(/data-file="js\/app.js"[^>]*defer/);
  });

  it("turns local images, icons and inline-style URLs into data URLs, and leaves page links for the editor", () => {
    expect(out).toContain(`<img src="${PNG}"`);
    expect(out).toContain("data:image/svg+xml;charset=utf-8,");
    expect(out).toContain(`style="background:url(&quot;${PNG}&quot;)"`);
    expect(out).toContain('<a href="about.html">');
  });

  it("adds the preview helper first in <head>, with local data files for fetch()", () => {
    const head = out.slice(out.indexOf("<head>"), out.indexOf("<style"));
    expect(head).toContain("remaxx:navigate");
    expect(head).toContain('"data.json":"{\\"a\\":1}"');
    expect(head).not.toContain('"about.html"');
  });

  it("can render another page of the project", () => {
    expect(bundleForPreview(input, "about.html")).toContain("<h1>About</h1>");
  });

  it("shows a friendly message when the page is missing, with the name escaped", () => {
    expect(bundleForPreview({ ...input, entryPath: "<x>.html" })).toContain(
      "Couldn't find &lt;x>.html",
    );
  });

  it("keeps data files from closing the helper script early", () => {
    const tricky = bundleForPreview({
      entryPath: "index.html",
      text: { "index.html": "<head></head>", "a.json": '"</script><script>alert(1)</script>"' },
      assets: {},
    });
    expect(tricky).not.toContain("</script><script>alert(1)");
  });
});

describe("rewriteCssUrls", () => {
  it("leaves unknown and external URLs as they were", () => {
    const css = "a{background:url(missing.png)} b{background:url('https://x.example/a.png')}";
    expect(
      rewriteCssUrls(css, "style.css", { entryPath: "index.html", text: {}, assets: {} }),
    ).toBe(css);
  });
});
