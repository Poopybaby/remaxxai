import { describe, expect, it } from "vitest";
import {
  applyEditOps,
  formatProjectFiles,
  locate,
  parseEditResponse,
  ProjectTooLargeError,
} from "@/lib/ai/edit-protocol";

const FILES = {
  "index.html":
    '<!doctype html>\n<html>\n  <body>\n    <h1 class="title">Moonbrew</h1>\n    <p>Coffee after dark</p>\n  </body>\n</html>',
  "style.css": "body {\n  background: #fff;\n  color: #111;\n}",
};
const OPTS = { binaryPaths: ["img/logo.png"], entryPath: "index.html" };

describe("parseEditResponse", () => {
  it("reads the summary and every kind of block in order", () => {
    const res = parseEditResponse(`SUMMARY: Made it dark and added a footer.

<<<EDIT path="style.css">>>
<<<<<<< SEARCH
  background: #fff;
  color: #111;
=======
  background: #0b0b14;
  color: #f5f5f5;
>>>>>>> REPLACE
<<<END>>>

<<<WRITE path="footer.js">>>
document.body.append("bye");
<<<END>>>

<<<DELETE path="old.js">>>`);
    expect(res.summary).toBe("Made it dark and added a footer.");
    expect(res.ops).toEqual([
      {
        type: "edit",
        path: "style.css",
        blocks: [
          {
            search: "  background: #fff;\n  color: #111;",
            replace: "  background: #0b0b14;\n  color: #f5f5f5;",
          },
        ],
      },
      { type: "write", path: "footer.js", content: 'document.body.append("bye");' },
      { type: "delete", path: "old.js" },
    ]);
    expect(res.incomplete).toEqual([]);
  });

  it("handles several SEARCH/REPLACE pairs, Windows line endings and fenced files", () => {
    const res = parseEditResponse(
      'SUMMARY: Two tweaks.\r\n<<<EDIT path="index.html">>>\r\n<<<<<<< SEARCH\r\nMoonbrew\r\n=======\r\nSunbrew\r\n>>>>>>> REPLACE\r\n<<<<<<< SEARCH\r\nCoffee\r\n=======\r\nTea\r\n>>>>>>> REPLACE\r\n<<<END>>>\r\n<<<WRITE path="a.css">>>\r\n```css\r\nbody{}\r\n```\r\n<<<END>>>',
    );
    expect(res.ops[0]).toMatchObject({
      type: "edit",
      blocks: [{ search: "Moonbrew" }, { search: "Coffee" }],
    });
    expect(res.ops[1]).toEqual({ type: "write", path: "a.css", content: "body{}" });
  });

  it("flags blocks that were cut off instead of applying half a file", () => {
    const res = parseEditResponse(
      'SUMMARY: Rewrote it.\n<<<WRITE path="index.html">>>\n<html><body>half',
    );
    expect(res.ops).toEqual([]);
    expect(res.incomplete).toEqual(["index.html"]);
  });

  it("treats a reply with no blocks as an explanation", () => {
    const res = parseEditResponse(
      "SUMMARY: I can't add a payment form, but I can add a contact link.",
    );
    expect(res.ops).toEqual([]);
    expect(res.summary).toMatch(/can't add a payment form/);
  });

  it("uses the text before the first block when SUMMARY is missing", () => {
    expect(parseEditResponse('Sure! Done.\n<<<DELETE path="x.js">>>').summary).toBe("Sure! Done.");
  });
});

describe("locate", () => {
  it("finds exact text", () => {
    expect(locate("abc def", "def")).toEqual({ start: 4, end: 7 });
  });
  it("tolerates re-indented lines", () => {
    const at = locate(
      FILES["index.html"],
      '<h1 class="title">Moonbrew</h1>\n<p>Coffee after dark</p>',
    );
    expect(at).not.toBeNull();
    expect(FILES["index.html"].slice(at!.start, at!.end)).toBe(
      '    <h1 class="title">Moonbrew</h1>\n    <p>Coffee after dark</p>',
    );
  });
  it("returns null when nothing matches or the search is empty", () => {
    expect(locate("abc", "xyz")).toBeNull();
    expect(locate("abc", "")).toBeNull();
  });
});

describe("applyEditOps", () => {
  it("applies edits, writes and deletes, and reports each change", () => {
    const res = applyEditOps(
      { ...FILES, "old.js": "x" },
      [
        { type: "edit", path: "style.css", blocks: [{ search: "#fff", replace: "#000" }] },
        { type: "write", path: "new.js", content: "console.log(1)" },
        { type: "delete", path: "old.js" },
      ],
      OPTS,
    );
    expect(res.problems).toEqual([]);
    expect(res.changes.map((c) => [c.path, c.kind])).toEqual([
      ["new.js", "added"],
      ["old.js", "deleted"],
      ["style.css", "modified"],
    ]);
    expect(res.files["style.css"]).toContain("#000");
    expect(res.files).not.toHaveProperty("old.js");
  });

  it("never touches files outside the project, binary files or unknown types", () => {
    const res = applyEditOps(
      FILES,
      [
        { type: "write", path: "../../etc/passwd", content: "x" },
        { type: "write", path: "img/logo.png", content: "x" },
        { type: "write", path: "run.exe", content: "x" },
        { type: "write", path: "/abs.html", content: "x" },
      ],
      OPTS,
    );
    expect(res.changes).toEqual([]);
    expect(res.problems).toHaveLength(4);
  });

  it("keeps the entry page even if asked to delete it", () => {
    const res = applyEditOps(FILES, [{ type: "delete", path: "index.html" }], OPTS);
    expect(res.changes).toEqual([]);
    expect(res.problems[0]).toMatch(/Kept index.html/);
  });

  it("applies the matching parts of an edit and explains what it skipped", () => {
    const res = applyEditOps(
      FILES,
      [
        {
          type: "edit",
          path: "index.html",
          blocks: [
            { search: "Moonbrew", replace: "Sunbrew" },
            { search: "this text is not there", replace: "x" },
          ],
        },
        { type: "edit", path: "missing.css", blocks: [{ search: "a", replace: "b" }] },
      ],
      OPTS,
    );
    expect(res.files["index.html"]).toContain("Sunbrew");
    expect(res.problems).toEqual([
      "1 of 2 changes to index.html didn't match the current file and was skipped.",
      "Skipped changes to missing.css: that file doesn't exist.",
    ]);
  });

  it("reports nothing when a write leaves a file unchanged", () => {
    const res = applyEditOps(
      FILES,
      [{ type: "write", path: "style.css", content: FILES["style.css"] }],
      OPTS,
    );
    expect(res.changes).toEqual([]);
  });

  it("can edit a file it created earlier in the same answer", () => {
    const res = applyEditOps(
      FILES,
      [
        { type: "write", path: "a.js", content: "let x = 1;" },
        { type: "edit", path: "a.js", blocks: [{ search: "1", replace: "2" }] },
      ],
      OPTS,
    );
    expect(res.files["a.js"]).toBe("let x = 2;");
  });
});

describe("formatProjectFiles", () => {
  it("puts the entry page first and lists binary files by name", () => {
    const out = formatProjectFiles(
      { "z.css": "z", "index.html": "<h1>", "a.js": "a" },
      ["logo.png"],
      "index.html",
    );
    expect(out.indexOf('path="index.html"')).toBeLessThan(out.indexOf('path="z.css"'));
    expect(out.indexOf('path="z.css"')).toBeLessThan(out.indexOf('path="a.js"'));
    expect(out).toContain("Binary files, not shown: logo.png");
  });

  it("leaves out files that don't fit, but never the entry page", () => {
    const out = formatProjectFiles(
      { "index.html": "x".repeat(50), "big.js": "y".repeat(500) },
      [],
      "index.html",
      200,
    );
    expect(out).toContain("left out to save space");
    expect(out).not.toContain("yyyy");
    expect(() =>
      formatProjectFiles({ "index.html": "x".repeat(500) }, [], "index.html", 200),
    ).toThrow(ProjectTooLargeError);
  });
});
