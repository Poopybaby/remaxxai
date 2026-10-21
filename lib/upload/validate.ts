/**
 * Turns whatever the person dropped in (a zip's entries, a folder, or one HTML file) into a
 * clean list of project files, or explains exactly what to fix. Treats every byte as untrusted.
 * Runs in the browser for instant feedback and again on the server, where it's authoritative.
 */
import { UPLOAD_LIMITS } from "@/config/limits";
import { extensionOf, NEEDS_BUILD_EXTENSIONS, typeFor } from "./mime";
import type { RawEntry, UploadFile, UploadIssue } from "./types";

/** Files silently dropped: OS clutter that people never mean to upload. */
const IGNORED = [
  /(^|\/)\.DS_Store$/,
  /(^|\/)Thumbs\.db$/i,
  /(^|\/)desktop\.ini$/i,
  /^__MACOSX(\/|$)/,
];

/** Never allowed, even if the extension would be: secrets and version-control internals. */
const FORBIDDEN: { pattern: RegExp; message: string }[] = [
  { pattern: /(^|\/)\.env(\.|$)/i, message: "Remove .env files. They usually contain secrets." },
  { pattern: /(^|\/)\.git(\/|$)/, message: "Remove the .git folder before uploading." },
  {
    pattern: /(^|\/)node_modules(\/|$)/,
    message: "Remove node_modules; it isn't needed to show your site.",
  },
  { pattern: /\.(pem|key|p12|pfx|crt|cer)$/i, message: "Remove certificate and key files." },
  { pattern: /(^|\/)id_(rsa|ed25519|ecdsa)(\.pub)?$/i, message: "Remove SSH keys." },
];

export type ValidationResult =
  | { ok: true; files: UploadFile[]; entryPath: string; totalBytes: number; dropped: string[] }
  | { ok: false; issues: UploadIssue[] };

/** Normalizes one path, or returns why it's unsafe. */
export function normalizePath(
  raw: string,
): { ok: true; path: string } | { ok: false; message: string } {
  if (raw.includes("\0"))
    return { ok: false, message: "File names can't contain null characters." };
  const path = raw.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path))
    return { ok: false, message: "Use relative paths only." };
  const parts = path.split("/").filter((p) => p !== "" && p !== ".");
  if (parts.some((p) => p === ".."))
    return { ok: false, message: "Paths can't go outside the project folder." };
  if (parts.length === 0) return { ok: false, message: "Empty file name." };
  if (parts.length > UPLOAD_LIMITS.maxPathDepth)
    return { ok: false, message: "Folders are nested too deeply." };
  const joined = parts.join("/");
  if (joined.length > UPLOAD_LIMITS.maxPathLength)
    return { ok: false, message: "File path is too long." };
  if (parts.some((p) => /[\u0000-\u001f<>:"|?*]/.test(p))) {
    return { ok: false, message: "File names contain characters that aren't allowed." };
  }
  return { ok: true, path: joined };
}

/** If every file sits inside one top-level folder (e.g. "my-site/..."), drop that folder. */
export function stripCommonRoot(paths: string[]): string[] {
  if (paths.length === 0) return paths;
  const first = paths[0]!.split("/");
  if (first.length < 2) return paths;
  const root = first[0];
  if (!paths.every((p) => p.split("/").length >= 2 && p.split("/")[0] === root)) return paths;
  return paths.map((p) => p.split("/").slice(1).join("/"));
}

function isValidUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function validateUpload(entries: RawEntry[]): ValidationResult {
  const issues: UploadIssue[] = [];
  const dropped: string[] = [];

  // 1. Normalize paths and drop clutter.
  const normalized: { path: string; bytes: Uint8Array }[] = [];
  for (const entry of entries) {
    const n = normalizePath(entry.path);
    if (!n.ok) {
      issues.push({ path: entry.path, message: n.message });
      continue;
    }
    if (IGNORED.some((re) => re.test(n.path))) {
      dropped.push(n.path);
      continue;
    }
    normalized.push({ path: n.path, bytes: entry.bytes });
  }
  if (issues.length) return { ok: false, issues };
  if (normalized.length === 0) return { ok: false, issues: [{ message: "No files to upload." }] };

  const stripped = stripCommonRoot(normalized.map((f) => f.path));
  normalized.forEach((f, i) => (f.path = stripped[i]!));

  // 2. Whole-project limits.
  if (normalized.length > UPLOAD_LIMITS.maxFiles) {
    return {
      ok: false,
      issues: [{ message: `Projects can have at most ${UPLOAD_LIMITS.maxFiles} files.` }],
    };
  }
  const totalBytes = normalized.reduce((sum, f) => sum + f.bytes.byteLength, 0);
  if (totalBytes > UPLOAD_LIMITS.maxTotalBytes) {
    const mb = (UPLOAD_LIMITS.maxTotalBytes / 1024 / 1024).toFixed(0);
    return {
      ok: false,
      issues: [
        { message: `Projects can be at most ${mb} MB. Compress images or remove unused files.` },
      ],
    };
  }
  const seen = new Set<string>();
  for (const f of normalized) {
    const key = f.path.toLowerCase();
    if (seen.has(key)) issues.push({ path: f.path, message: "Two files have the same name." });
    seen.add(key);
  }

  // 3. Projects that need a build step aren't supported yet.
  const needsBuild = normalized.filter((f) => NEEDS_BUILD_EXTENSIONS.has(extensionOf(f.path)));
  const hasPackageJson = normalized.some((f) => f.path === "package.json");
  if (
    needsBuild.length > 0 ||
    (hasPackageJson && !normalized.some((f) => f.path === "index.html"))
  ) {
    return {
      ok: false,
      issues: [
        {
          message:
            "This looks like source code that needs a build step (React, Vue, TypeScript…). Run your build and upload the output folder (usually dist or build), or upload a single HTML file.",
        },
      ],
    };
  }

  // 4. Per-file checks.
  const files: UploadFile[] = [];
  for (const f of normalized) {
    const forbidden = FORBIDDEN.find((rule) => rule.pattern.test(f.path));
    if (forbidden) {
      issues.push({ path: f.path, message: forbidden.message });
      continue;
    }
    const type = typeFor(f.path);
    if (!type) {
      issues.push({
        path: f.path,
        message: `.${extensionOf(f.path) || "?"} files aren't supported.`,
      });
      continue;
    }
    if (f.bytes.byteLength > UPLOAD_LIMITS.maxFileBytes) {
      issues.push({
        path: f.path,
        message: `Each file can be at most ${UPLOAD_LIMITS.maxFileBytes / 1024 / 1024} MB.`,
      });
      continue;
    }
    if (type.text && !isValidUtf8Text(f.bytes)) {
      issues.push({ path: f.path, message: "This file isn't valid UTF-8 text." });
      continue;
    }
    if (type.magic && !type.magic(f.bytes)) {
      issues.push({ path: f.path, message: "This file's contents don't match its extension." });
      continue;
    }
    files.push({ path: f.path, bytes: f.bytes, mime: type.mime, isText: type.text });
  }
  if (issues.length) return { ok: false, issues };

  // 5. Entry point: index.html at the top level, or the only HTML file.
  let entryPath = files.find((f) => f.path === "index.html")?.path;
  if (!entryPath) {
    const htmlFiles = files.filter((f) => /\.html?$/i.test(f.path));
    if (htmlFiles.length === 1 && !htmlFiles[0]!.path.includes("/")) {
      // A single HTML file becomes the entry point; rename it so links to "/" work.
      htmlFiles[0]!.path = "index.html";
      entryPath = "index.html";
    }
  }
  if (!entryPath) {
    return {
      ok: false,
      issues: [{ message: "Add an index.html at the top level of your project." }],
    };
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return { ok: true, files, entryPath, totalBytes, dropped };
}
