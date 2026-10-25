"use client";

import type { EditorFile } from "@/lib/projects/versions";
import { cn } from "@/lib/utils/cn";

/** The project's files, folders shown by indentation. A dot marks unsaved changes. */
export function FileTree({
  text,
  binaries,
  savedText,
  selected,
  onSelect,
}: {
  text: Record<string, string>;
  binaries: EditorFile[];
  savedText: Record<string, string>;
  selected: string;
  onSelect: (path: string) => void;
}) {
  const paths = [...Object.keys(text), ...binaries.map((b) => b.path)].sort((a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    const fa = a.split("/").slice(0, -1).join("/");
    const fb = b.split("/").slice(0, -1).join("/");
    return fa === fb ? a.localeCompare(b) : fa.localeCompare(fb) || da - db;
  });
  const folderOf = (p: string) => p.split("/").slice(0, -1).join("/");
  return (
    <nav
      aria-label="Files"
      className="border-line bg-ink w-44 shrink-0 overflow-y-auto border-r py-2 text-[13px] sm:w-52"
    >
      <ul>
        {paths.map((p, i) => {
          const parts = p.split("/");
          const folder = folderOf(p);
          const header =
            folder && folder !== (i > 0 ? folderOf(paths[i - 1]!) : "") ? folder : null;
          const changed = p in text && savedText[p] !== text[p];
          const isText = p in text;
          return (
            <li key={p}>
              {header ? (
                <p className="text-faint truncate px-3 pt-2 pb-1 text-xs">{header}/</p>
              ) : null}
              <button
                type="button"
                onClick={() => onSelect(p)}
                aria-current={selected === p ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-1.5 truncate py-1 pr-2 text-left font-mono",
                  folder ? "pl-6" : "pl-3",
                  selected === p
                    ? "bg-panel-raised text-fg"
                    : "text-muted hover:text-fg hover:bg-panel",
                  !isText && "opacity-70",
                )}
              >
                <span className="truncate">{parts[parts.length - 1]}</span>
                {changed ? (
                  <span
                    className="bg-magenta size-1.5 shrink-0 rounded-full"
                    aria-label="unsaved changes"
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
