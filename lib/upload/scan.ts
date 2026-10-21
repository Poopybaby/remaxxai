/**
 * Heuristic abuse scan for uploaded and AI-generated files. It catches the obvious cases
 * (leaked secrets, miners, credential-harvesting forms, heavy obfuscation). It is a tripwire,
 * not a guarantee: previews also run sandboxed on a separate origin, and people can report.
 *
 * "block" findings reject the upload with a message the uploader can act on.
 * "flag" findings publish nothing until an admin reviews the project.
 */
import type { ScanFinding, UploadFile } from "./types";

type Rule = {
  id: string;
  severity: "block" | "flag";
  message: string;
  /** Which files the rule applies to. */
  applies: (path: string) => boolean;
  test: (text: string) => boolean;
};

const isCode = (p: string) =>
  /\.(html?|js|mjs|json|svg|css|txt|md|xml|map|webmanifest)$/i.test(p) || !p.includes(".");
const isMarkupOrScript = (p: string) => /\.(html?|js|mjs|svg)$/i.test(p);
const isHtml = (p: string) => /\.html?$/i.test(p);

const re = (pattern: RegExp) => (t: string) => pattern.test(t);

const RULES: Rule[] = [
  // ── Secrets (block): the uploader almost certainly didn't mean to publish these. ──
  {
    id: "secret.private_key",
    severity: "block",
    message: "Contains a private key. Remove it before uploading.",
    applies: isCode,
    test: re(/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/),
  },
  {
    id: "secret.api_key",
    severity: "block",
    message:
      "Contains what looks like a secret API key. Remove it (and rotate it) before uploading.",
    applies: isCode,
    test: re(
      /\b(?:sk-ant-[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9]{32,}|sk_live_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,}|sb_secret_[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|xox[baprs]-[A-Za-z0-9-]{10,}|whsec_[A-Za-z0-9]{20,})\b/,
    ),
  },

  // ── Malware patterns (flag). ──
  {
    id: "malware.miner",
    severity: "flag",
    message: "References a browser crypto-miner.",
    applies: isMarkupOrScript,
    test: re(
      /coinhive|coin-hive|cryptonight|webminepool|coinimp|jsecoin|crypto-loot|minero\.cc|xmrig|webmin(?:er|ing)\.js/i,
    ),
  },
  {
    id: "malware.obfuscated_eval",
    severity: "flag",
    message: "Runs decoded or obfuscated code (eval of encoded text).",
    applies: isMarkupOrScript,
    test: re(
      /\b(?:eval|Function)\s*\(\s*(?:atob|unescape|decodeURIComponent|String\.fromCharCode)\s*\(|document\.write\s*\(\s*(?:unescape|atob)\s*\(/,
    ),
  },
  {
    id: "malware.packed_payload",
    severity: "flag",
    message: "Contains a very large encoded blob inside a script.",
    applies: (p) => /\.(js|mjs)$/i.test(p),
    test: (t) =>
      /["'`][A-Za-z0-9+/=]{8000,}["'`]/.test(t) ||
      (t.match(/\\x[0-9a-f]{2}/gi)?.length ?? 0) > 2000,
  },

  // ── Phishing patterns (flag). ──
  {
    id: "phishing.external_password_form",
    severity: "flag",
    message: "Has a password field in a form that sends data to another website.",
    applies: isHtml,
    test: (t) =>
      /type\s*=\s*["']?password/i.test(t) &&
      /<form[^>]*action\s*=\s*["']?\s*(?:https?:)?\/\//i.test(t),
  },
  {
    id: "phishing.credential_exfiltration",
    severity: "flag",
    message: "Reads password or card fields and sends them to a server.",
    applies: isMarkupOrScript,
    test: (t) =>
      /(?:type\s*=\s*["']?password|\[type=["']?password|cc-number|card-?number|cvv|cvc)/i.test(t) &&
      /(?:fetch|sendBeacon|XMLHttpRequest|axios)\s*[.(]/i.test(t) &&
      /https?:\/\/(?!localhost|127\.0\.0\.1)/i.test(t),
  },
  {
    id: "phishing.brand_login",
    severity: "flag",
    message: "Looks like a sign-in page for a well-known company.",
    applies: isHtml,
    test: (t) =>
      /type\s*=\s*["']?password/i.test(t) &&
      /\b(?:paypal|apple\s?id|icloud|microsoft\s?(?:365|account)|office\s?365|outlook|gmail|google\s?account|facebook|instagram|netflix|amazon|chase|wells\s?fargo|bank\s?of\s?america|coinbase|binance|metamask|steam)\b/i.test(
        t,
      ),
  },
  {
    id: "phishing.seed_phrase",
    severity: "flag",
    message: "Asks for a wallet recovery or seed phrase.",
    applies: isHtml,
    test: (t) =>
      /\b(?:seed|recovery|secret recovery|mnemonic)\s+phrase\b/i.test(t) &&
      /<(?:input|textarea)/i.test(t),
  },
  {
    id: "malware.keylogger",
    severity: "flag",
    message: "Records keystrokes and sends them to a server.",
    applies: isMarkupOrScript,
    test: (t) =>
      /addEventListener\s*\(\s*["'](?:keydown|keypress|keyup)["']/i.test(t) &&
      /(?:sendBeacon|new\s+Image\(\)\.src|fetch\s*\(\s*["'`]https?:)/i.test(t),
  },
];

export type ScanResult = { blocking: ScanFinding[]; flags: ScanFinding[] };

export function scanFiles(files: Pick<UploadFile, "path" | "bytes" | "isText">[]): ScanResult {
  const decoder = new TextDecoder("utf-8");
  const blocking: ScanFinding[] = [];
  const flags: ScanFinding[] = [];

  for (const file of files) {
    if (!file.isText) continue;
    const text = decoder.decode(file.bytes);
    for (const rule of RULES) {
      if (!rule.applies(file.path) || !rule.test(text)) continue;
      const finding = {
        path: file.path,
        rule: rule.id,
        message: rule.message,
        severity: rule.severity,
      };
      (rule.severity === "block" ? blocking : flags).push(finding);
    }
  }
  return { blocking, flags };
}

export const SCAN_RULE_IDS = RULES.map((r) => r.id);
