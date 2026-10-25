"use client";

import { useEffect, useRef, useState } from "react";
import { bundleForPreview } from "@/lib/editor/bundle";

/**
 * The editor's live preview. A sandboxed iframe on the preview origin loads a blank "runner"
 * page; when it says it's ready we post it the bundled project. Every change reloads the runner
 * (debounced), so each render starts from a clean page with no leftover state or timers.
 */
export function LivePreview({
  previewOrigin,
  entryPath,
  text,
  assets,
  device,
  onNavigate,
  page,
}: {
  previewOrigin: string;
  entryPath: string;
  text: Record<string, string>;
  assets: Record<string, string>;
  device: "desktop" | "mobile";
  page: string;
  onNavigate: (path: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState("");
  const [renderKey, setRenderKey] = useState(0);
  const latest = useRef("");

  // Rebuild the page a moment after typing stops.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = bundleForPreview({ entryPath, text, assets }, page in text ? page : entryPath);
      if (next !== latest.current) {
        latest.current = next;
        setHtml(next);
        setRenderKey((k) => k + 1);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [entryPath, text, assets, page]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // The runner is sandboxed, so its origin is opaque ("null"): identify it by its window.
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const data = e.data as { type?: string; path?: string } | null;
      if (data?.type === "remaxx:ready") {
        // "*" because an opaque origin can't be named; the message is the person's own files.
        frame.current.contentWindow?.postMessage(
          { type: "remaxx:render", html: latest.current },
          "*",
        );
      } else if (data?.type === "remaxx:navigate" && typeof data.path === "string") {
        onNavigate(data.path);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [previewOrigin, onNavigate]);

  return (
    <div className="bg-ink-deep flex h-full min-h-0 items-start justify-center overflow-auto">
      {html ? (
        <iframe
          key={renderKey}
          ref={frame}
          src={`${previewOrigin}/run`}
          title="Live preview"
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          className={
            device === "mobile"
              ? "border-line-strong my-4 h-[740px] w-[375px] shrink-0 rounded-[28px] border-8 bg-white"
              : "h-full w-full bg-white"
          }
        />
      ) : null}
    </div>
  );
}
