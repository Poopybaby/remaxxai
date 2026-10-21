"use client";

import { useEffect, useState } from "react";
import type { FileEntry } from "@/lib/projects/queries";
import { cn } from "@/lib/utils/cn";

type Tab = "preview" | "files";
type Device = "desktop" | "mobile";

const sizeLabel = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * The live preview and the source browser. The preview is an iframe on the separate preview
 * origin with a restrictive sandbox (scripts yes; same-origin, forms and top navigation no).
 */
export function PreviewPanel({
  projectId,
  versionId,
  previewUrl,
  title,
  files,
  canPreview,
}: {
  projectId: string;
  versionId: string;
  previewUrl: string;
  title: string;
  files: FileEntry[];
  /** Previews are served only for published projects; owners of hidden ones still see the files. */
  canPreview: boolean;
}) {
  const [tab, setTab] = useState<Tab>(canPreview ? "preview" : "files");
  const [device, setDevice] = useState<Device>("desktop");

  return (
    <div className="border-line bg-panel flex flex-col overflow-hidden rounded-[var(--radius-card)] border">
      <div className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-2 py-2">
        <div role="tablist" aria-label="View" className="flex gap-1">
          {(canPreview ? (["preview", "files"] as const) : (["files"] as const)).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "h-9 rounded-lg px-3 text-sm font-semibold",
                tab === t ? "bg-panel-raised text-fg" : "text-muted hover:text-fg",
              )}
            >
              {t === "preview" ? "Preview" : `Files (${files.length})`}
            </button>
          ))}
        </div>
        {tab === "preview" && canPreview ? (
          <div className="flex items-center gap-1">
            {(["desktop", "mobile"] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={device === d}
                onClick={() => setDevice(d)}
                className={cn(
                  "hidden h-9 rounded-lg px-3 text-sm font-semibold sm:block",
                  device === d ? "bg-panel-raised text-fg" : "text-muted hover:text-fg",
                )}
              >
                {d === "desktop" ? "Desktop" : "Phone"}
              </button>
            ))}
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-fg h-9 rounded-lg px-3 text-sm leading-9 font-semibold"
            >
              Open in new tab
            </a>
          </div>
        ) : null}
      </div>

      {tab === "preview" && canPreview ? (
        <div className="bg-ink-deep flex justify-center">
          <iframe
            src={previewUrl}
            title={`Live preview of ${title}`}
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            loading="lazy"
            allow=""
            className={cn(
              "h-[70svh] min-h-[420px] w-full border-0 bg-white transition-[max-width] duration-300",
              device === "mobile" ? "max-w-[390px]" : "max-w-full",
            )}
          />
        </div>
      ) : (
        <FileBrowser
          projectId={projectId}
          versionId={versionId}
          files={files}
          previewBase={canPreview ? previewUrl : null}
        />
      )}
    </div>
  );
}

function FileBrowser({
  projectId,
  versionId,
  files,
  previewBase,
}: {
  projectId: string;
  versionId: string;
  files: FileEntry[];
  previewBase: string | null;
}) {
  const initial = files.find((f) => f.path === "index.html")?.path ?? files[0]?.path ?? "";
  const [selected, setSelected] = useState(initial);
  const [content, setContent] = useState<{
    path: string;
    text: string | null;
    error?: string;
  } | null>(null);
  const file = files.find((f) => f.path === selected);
  const isImage = file?.mime.startsWith("image/") && !file.mime.includes("svg");

  useEffect(() => {
    if (!file || isImage) return;
    let cancelled = false;
    fetch(
      `/api/projects/${projectId}/file?version=${versionId}&path=${encodeURIComponent(file.path)}`,
    )
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 415)
          setContent({ path: file.path, text: null, error: "This is a binary file." });
        else if (!res.ok)
          setContent({ path: file.path, text: null, error: "Couldn't load this file." });
        else setContent({ path: file.path, text: await res.text() });
      })
      .catch(
        () =>
          !cancelled &&
          setContent({ path: file.path, text: null, error: "Couldn't load this file." }),
      );
    return () => {
      cancelled = true;
    };
  }, [file, isImage, projectId, versionId]);

  const shown = content?.path === selected ? content : null;
  const lines = shown?.text?.split("\n") ?? [];
  const imageSrc =
    previewBase && isImage ? previewBase.replace(/[^/]*$/, "") + encodeURI(selected) : null;

  return (
    <div className="grid min-h-[420px] md:grid-cols-[240px_minmax(0,1fr)]">
      <ul
        className="border-line max-h-48 overflow-auto border-b p-2 md:max-h-[70svh] md:border-r md:border-b-0"
        aria-label="Files"
      >
        {files.map((f) => (
          <li key={f.path}>
            <button
              type="button"
              onClick={() => setSelected(f.path)}
              aria-current={f.path === selected}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left font-mono text-[13px]",
                f.path === selected ? "bg-panel-raised text-fg" : "text-muted hover:text-fg",
              )}
            >
              <span className="truncate">{f.path}</span>
              <span className="text-faint shrink-0 text-[11px]">{sizeLabel(f.size)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="bg-ink-deep max-h-[70svh] min-w-0 overflow-auto">
        {isImage ? (
          imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- served from the sandboxed preview origin
            <img
              src={imageSrc}
              alt={selected}
              className="border-line m-4 max-h-[60svh] max-w-[calc(100%-2rem)] rounded border"
            />
          ) : (
            <p className="text-muted p-4 text-sm">
              Image preview is available once the project is public.
            </p>
          )
        ) : shown?.error ? (
          <p className="text-muted p-4 text-sm">{shown.error}</p>
        ) : shown ? (
          <pre className="text-fg p-4 font-mono text-[13px] leading-relaxed">
            <code>
              {lines.map((line, i) => (
                <span key={i} className="flex">
                  <span
                    aria-hidden
                    className="text-faint w-10 shrink-0 pr-4 text-right select-none"
                  >
                    {i + 1}
                  </span>
                  <span className="whitespace-pre">{line}</span>
                </span>
              ))}
            </code>
          </pre>
        ) : (
          <p className="text-muted p-4 text-sm">Loading…</p>
        )}
      </div>
    </div>
  );
}
