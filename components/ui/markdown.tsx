import { Fragment, type ReactNode } from "react";

/**
 * A small, safe Markdown renderer for AI-written explanations: headings, paragraphs, lists,
 * code blocks, inline code, bold and italics. It builds React elements from text (no HTML is
 * ever injected), and ignores links and images on purpose: model output shouldn't send people
 * anywhere.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={className}>{blocks(text)}</div>;
}

function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*|_[^_\n]+_)/g;
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const tok = m[0];
    const k = `${key}-${n++}`;
    if (m[1]) {
      out.push(
        <code
          key={k}
          className="bg-ink-deep text-cyan rounded px-1.5 py-0.5 font-mono text-[0.9em]"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      out.push(
        <strong key={k} className="text-fg font-semibold">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    }
    last = at + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  // Strip link syntax down to its text: [label](url) → label.
  return out.map((part) =>
    typeof part === "string" ? part.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") : part,
  );
}

function blocks(src: string): ReactNode[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^```/);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) code.push(lines[i++]!);
      i++;
      out.push(
        <pre
          key={k++}
          className="bg-ink-deep border-line my-3 overflow-x-auto rounded-lg border p-3 text-sm"
        >
          <code className="font-mono">{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1]!.length;
      const cls =
        level <= 2
          ? "text-fg mt-6 mb-2 text-lg font-bold first:mt-0"
          : "text-fg mt-4 mb-1.5 font-semibold";
      out.push(
        level <= 2 ? (
          <h3 key={k++} className={cls}>
            {inline(heading[2]!)}
          </h3>
        ) : (
          <h4 key={k++} className={cls}>
            {inline(heading[2]!)}
          </h4>
        ),
      );
      i++;
      continue;
    }
    const bullet = /^\s*[-*+]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? numbered : bullet).test(lines[i]!)) {
        let item = lines[i]!.replace(ordered ? numbered : bullet, "");
        i++;
        // Continuation lines indented under the item.
        while (
          i < lines.length &&
          /^\s{2,}\S/.test(lines[i]!) &&
          !bullet.test(lines[i]!) &&
          !numbered.test(lines[i]!)
        ) {
          item += ` ${lines[i]!.trim()}`;
          i++;
        }
        items.push(item);
      }
      const List = ordered ? "ol" : "ul";
      out.push(
        <List
          key={k++}
          className={`my-2 space-y-1.5 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}
        >
          {items.map((item, j) => (
            <li key={j}>{inline(item, `${k}-${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(#{1,4}\s|```|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i]!)
    ) {
      para.push(lines[i]!.trim());
      i++;
    }
    out.push(
      <p key={k++} className="my-2 leading-relaxed">
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 ? " " : null}
            {inline(p, `${k}-${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return out;
}
