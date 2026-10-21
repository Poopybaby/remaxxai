/** Shapes shared by the upload pipeline. Runs in the browser (pre-checks) and on the server (authoritative). */

export type RawEntry = { path: string; bytes: Uint8Array };

export type UploadFile = {
  path: string;
  bytes: Uint8Array;
  mime: string;
  isText: boolean;
};

export type UploadIssue = { path?: string; message: string };

export type ScanFinding = {
  path: string;
  rule: string;
  message: string;
  /** "block" rejects the upload; "flag" holds it for admin review. */
  severity: "block" | "flag";
};
