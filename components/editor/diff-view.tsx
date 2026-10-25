"use client";

import { structuredPatch } from "diff";
import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";

export function lineStats(before: string, after: string): { added: number; removed: number } {
  const patch = structuredPatch("a", "b", before, after, "", "", { context: 0 });
  let added = 0;
  let removed = 0;
  for (const h of patch.hunks) {
    for (const l of h.lines) {
      if (l.startsWith("+")) added++;
      else if (l.startsWith("-")) removed++;
    }
  }
  return { added, removed };
}

/** A unified diff of one file: removed lines in red, added in green, a little context. */
export function DiffView({ before, after }: { before: string; after: string }) {
  const hunks = useMemo(
    () => structuredPatch("a", "b", before, after, "", "", { context: 2 }).hunks,
    [before, after],
  );
  if (hunks.length === 0) return <p className="text-faint px-3 py-2 text-xs">No line changes.</p>;
  return (
    <div className="bg-ink-deep max-h-80 overflow-auto font-mono text-[12px] leading-5">
      {hunks.map((h, i) => {
        let oldNo = h.oldStart;
        let newNo = h.newStart;
        return (
          <div key={i} className={cn(i > 0 && "border-line border-t")}>
            {h.lines
              .filter((l) => !l.startsWith("\\"))
              .map((l, j) => {
                const kind = l[0];
                const num = kind === "+" ? newNo++ : kind === "-" ? oldNo++ : (oldNo++, newNo++);
                return (
                  <div
                    key={j}
                    className={cn(
                      "flex gap-2 px-2 whitespace-pre-wrap",
                      kind === "+" && "bg-success/10 text-success",
                      kind === "-" && "bg-danger/10 text-danger",
                      kind === " " && "text-faint",
                    )}
                  >
                    <span className="w-8 shrink-0 text-right opacity-50 select-none">{num}</span>
                    <span className="w-3 shrink-0 select-none">{kind === " " ? "" : kind}</span>
                    <span className="min-w-0 break-all">{l.slice(1)}</span>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
