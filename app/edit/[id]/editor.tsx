"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodeEditor } from "@/components/editor/code-editor";
import { LivePreview } from "@/components/editor/live-preview";
import { Button } from "@/components/ui/button";
import type { FileChange } from "@/lib/ai/edit-protocol";
import type { EditorFile, VersionSummary } from "@/lib/projects/versions";
import { cn } from "@/lib/utils/cn";
import {
  ChatPanel,
  type ChatItem,
  type Credits,
  type ModelOption,
  type Proposal,
} from "./chat-panel";
import { ExplainDrawer, HistoryDrawer } from "./drawers";
import { FileTree } from "./file-tree";

export type EditorData = {
  project: { id: string; title: string; slug: string; entryPath: string; license: string };
  credit: { title: string; slug: string; ownerHandle: string } | null;
  version: { id: string; number: number };
  files: EditorFile[];
  history: ChatItem[];
  models: ModelOption[];
  credits: Credits;
  ai: { allowed: true } | { allowed: false; reason: string };
  previewOrigin: string;
};

type Saved = { versionId: string; number: number; files: EditorFile[] };
type MobileTab = "chat" | "preview" | "code";

const textOf = (files: EditorFile[]) =>
  Object.fromEntries(files.filter((f) => f.text !== null).map((f) => [f.path, f.text!]));

async function postJson<T>(
  url: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string; code?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
    if (!res.ok)
      return {
        ok: false,
        error: data.error ?? "Something went wrong. Try again.",
        code: data.code,
      };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "You seem to be offline. Check your connection and try again." };
  }
}

export function Editor({ data }: { data: EditorData }) {
  const router = useRouter();
  const { project } = data;
  const [saved, setSaved] = useState<Saved>({
    versionId: data.version.id,
    number: data.version.number,
    files: data.files,
  });
  const [text, setText] = useState<Record<string, string>>(() => textOf(data.files));
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState(project.entryPath);
  const [view, setView] = useState<"preview" | "code">("preview");
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [page, setPage] = useState(project.entryPath);
  const [chat, setChat] = useState<ChatItem[]>(data.history);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState<null | "ai" | "save" | "restore">(null);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [drawer, setDrawer] = useState<null | "history" | "explain">(null);
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [credits, setCredits] = useState<Credits>(data.credits);

  const binaries = useMemo(() => saved.files.filter((f) => f.text === null), [saved.files]);
  const savedText = useMemo(() => textOf(saved.files), [saved.files]);
  const dirty = useMemo(() => {
    const a = Object.keys(text);
    const b = Object.keys(savedText);
    return a.length !== b.length || a.some((p) => text[p] !== savedText[p]);
  }, [text, savedText]);

  // Images and fonts for the preview, fetched once per file.
  const fetched = useRef(new Set<string>());
  useEffect(() => {
    for (const f of binaries) {
      if (fetched.current.has(f.sha256)) continue;
      fetched.current.add(f.sha256);
      fetch(`/api/editor/${project.id}/asset?sha=${f.sha256}`)
        .then((r) => (r.ok ? r.blob() : null))
        .then(
          (blob) =>
            blob &&
            new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve(String(reader.result).replace(/^data:[^;]*;/, `data:${f.mime};`));
              reader.readAsDataURL(blob);
            }),
        )
        .then((url) => url && setAssets((a) => ({ ...a, [f.path]: url })))
        .catch(() => fetched.current.delete(f.sha256));
    }
  }, [binaries, project.id]);

  // Warn before leaving with unsaved hand edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const say = useCallback((kind: "error" | "info", t: string) => setNotice({ kind, text: t }), []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.kind === "error" ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [notice]);

  function adopt(version: VersionSummary, files: EditorFile[]) {
    setSaved({ versionId: version.id, number: version.number, files });
    setText(textOf(files));
    setVersions(null);
    if (!files.some((f) => f.path === selected)) setSelected(project.entryPath);
  }

  /** Saves the working files as a new version. Returns the new version id, or null. */
  async function save(
    files: Record<string, string>,
    message: string,
    createdBy: "user" | "ai",
    replyId?: string,
  ) {
    setBusy("save");
    const payload = [
      ...Object.entries(files).map(([path, t]) => ({ path, text: t })),
      ...binaries.map((b) => ({ path: b.path, sha256: b.sha256 })),
    ];
    const res = await postJson<{
      version: VersionSummary;
      changed: boolean;
      warnings: { message: string }[];
    }>(`/api/editor/${project.id}/save`, {
      baseVersionId: saved.versionId,
      files: payload,
      message,
      createdBy,
      replyId,
    });
    setBusy(null);
    if (!res.ok) {
      say("error", res.error);
      return null;
    }
    const nextFiles: EditorFile[] = [
      ...Object.entries(files).map(([path, t]) => {
        const old = saved.files.find((f) => f.path === path);
        return {
          path,
          sha256: old && old.text === t ? old.sha256 : "",
          size: new TextEncoder().encode(t).length,
          mime: old?.mime ?? "",
          text: t,
        };
      }),
      ...binaries,
    ].sort((a, b) => a.path.localeCompare(b.path));
    setSaved({ versionId: res.data.version.id, number: res.data.version.number, files: nextFiles });
    setText(files);
    setVersions(null);
    if (res.data.warnings.length) say("info", `Saved. Heads up: ${res.data.warnings[0]!.message}`);
    return res.data.changed ? res.data.version.id : saved.versionId;
  }

  /** Publishing uses the latest saved version, so unsaved edits are saved first. */
  async function goPublish() {
    if (busy) return;
    if (dirty && !(await save(text, "Edited by hand", "user"))) return;
    router.push(`/edit/${project.id}/publish`);
  }

  async function saveByHand() {
    if (!dirty || busy) return;
    const id = await save(text, "Edited by hand", "user");
    if (id) say("info", `Saved as version ${saved.number + 1}.`);
  }

  async function restore(versionId: string, note: string) {
    if (busy) return;
    setBusy("restore");
    const res = await postJson<{ version: VersionSummary; files: EditorFile[] }>(
      `/api/editor/${project.id}/restore`,
      { versionId },
    );
    setBusy(null);
    if (!res.ok) return say("error", res.error);
    adopt(res.data.version, res.data.files);
    setChat((c) => [
      ...c,
      { id: crypto.randomUUID(), role: "assistant", text: note, status: "ok" },
    ]);
  }

  async function ask(prompt: string, modelId: string, images: { base64: string }[]) {
    setBusy("ai");
    setProposal(null);
    setChat((c) => [
      ...c,
      { id: crypto.randomUUID(), role: "user", text: prompt, status: "ok", images: images.length },
    ]);
    const res = await postJson<{
      replyId: string;
      summary: string;
      changes: FileChange[];
      problems: string[];
      credits?: { balance: number; trialPrompts: number };
    }>(`/api/editor/${project.id}/ai`, {
      baseVersionId: saved.versionId,
      files: text,
      prompt,
      modelId,
      images,
    });
    setBusy(null);
    if (!res.ok) {
      setChat((c) => [
        ...c,
        { id: crypto.randomUUID(), role: "assistant", text: res.error, status: "error" },
      ]);
      return;
    }
    const { replyId, summary, changes, problems } = res.data;
    if (res.data.credits) {
      const c = res.data.credits;
      setCredits((cur) => ({ ...cur, balance: c.balance, trialPrompts: c.trialPrompts }));
    }
    if (changes.length === 0) {
      setChat((c) => [
        ...c,
        {
          id: replyId,
          role: "assistant",
          text: [summary, ...problems].join(" "),
          status: problems.length ? "error" : "ok",
        },
      ]);
      return;
    }
    setProposal({
      replyId,
      summary,
      changes,
      problems,
      include: new Set(changes.map((ch) => ch.path)),
    });
    setMobileTab("chat");
  }

  async function acceptProposal() {
    if (!proposal) return;
    const next = { ...text };
    for (const ch of proposal.changes) {
      if (!proposal.include.has(ch.path)) continue;
      if (ch.kind === "deleted") delete next[ch.path];
      else next[ch.path] = ch.after;
    }
    const before = saved.versionId;
    const id = await save(next, proposal.summary, "ai", proposal.replyId);
    if (!id) return;
    const count = proposal.include.size;
    setChat((c) => [
      ...c,
      {
        id: proposal.replyId,
        role: "assistant",
        text: proposal.summary,
        status: "ok",
        applied: { files: count, undoTo: before },
      },
    ]);
    setProposal(null);
  }

  function discardProposal() {
    if (!proposal) return;
    setChat((c) => [
      ...c,
      {
        id: proposal.replyId,
        role: "assistant",
        text: `${proposal.summary} (discarded)`,
        status: "ok",
        discarded: true,
      },
    ]);
    setProposal(null);
  }

  const onNavigate = useCallback(
    (path: string) => {
      const target =
        path in text
          ? path
          : `${path.replace(/\/$/, "")}${path.endsWith("/") ? "index.html" : ".html"}`;
      if (target in text && /\.html?$/i.test(target)) setPage(target);
    },
    [text],
  );

  const openHistory = async () => {
    setDrawer("history");
    if (versions) return;
    const res = await fetch(`/api/editor/${project.id}/versions`)
      .then((r) => r.json())
      .catch(() => null);
    setVersions((res as { versions?: VersionSummary[] } | null)?.versions ?? []);
  };

  const pagePaths = Object.keys(text).filter((p) => /\.html?$/i.test(p));

  const workspace = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "border-line flex h-12 shrink-0 items-center justify-between gap-2 border-b px-2",
          // On phones the toolbar only appears when there's something to pick.
          mobileTab === "preview" && pagePaths.length <= 1 && "hidden lg:flex",
        )}
      >
        <div role="tablist" aria-label="Workspace" className="hidden gap-1 lg:flex">
          {(["preview", "code"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "h-8 rounded-lg px-3 text-sm font-semibold",
                view === v ? "bg-panel-raised text-fg" : "text-muted hover:text-fg",
              )}
            >
              {v === "preview" ? "Preview" : "Code"}
            </button>
          ))}
        </div>
        {(view === "preview" || mobileTab === "preview") && pagePaths.length > 1 ? (
          <label className="text-muted flex items-center gap-2 text-sm">
            <span className="sr-only">Page</span>
            <select
              value={page}
              onChange={(e) => setPage(e.target.value)}
              className="bg-panel border-line h-8 rounded-lg border px-2 text-sm"
            >
              {pagePaths.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="text-faint truncate text-sm lg:hidden">
            {mobileTab === "code" ? selected : ""}
          </span>
        )}
        <div className="flex items-center gap-1">
          {(["desktop", "mobile"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={device === d}
              onClick={() => setDevice(d)}
              className={cn(
                "hidden h-8 rounded-lg px-3 text-sm font-semibold lg:block",
                view !== "preview" && "lg:hidden",
                device === d ? "bg-panel-raised text-fg" : "text-muted hover:text-fg",
              )}
            >
              {d === "desktop" ? "Desktop" : "Phone"}
            </button>
          ))}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          className={cn(
            "absolute inset-0",
            view === "preview" ? "lg:block" : "lg:hidden",
            mobileTab === "preview" ? "block" : "hidden",
          )}
        >
          <LivePreview
            previewOrigin={data.previewOrigin}
            entryPath={project.entryPath}
            text={text}
            assets={assets}
            device={device}
            page={page}
            onNavigate={onNavigate}
          />
        </div>
        <div
          className={cn(
            "absolute inset-0 flex",
            view === "code" ? "lg:flex" : "lg:hidden",
            mobileTab === "code" ? "flex" : "hidden",
          )}
        >
          <FileTree
            text={text}
            binaries={binaries}
            savedText={savedText}
            selected={selected}
            onSelect={(p) => setSelected(p)}
          />
          <div className="min-w-0 flex-1">
            {selected in text ? (
              <CodeEditor
                path={selected}
                value={text[selected]!}
                onChange={(p, v) => setText((t) => ({ ...t, [p]: v }))}
                onSave={saveByHand}
              />
            ) : (
              <BinaryInfo file={binaries.find((b) => b.path === selected)} url={assets[selected]} />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[520px] flex-col">
      <header className="border-line flex h-14 shrink-0 items-center justify-between gap-3 border-b px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/drafts"
            className="text-muted hover:text-fg shrink-0 text-sm"
            aria-label="Back to your drafts"
          >
            ←
          </Link>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold sm:text-base">{project.title}</p>
            <p className="text-faint truncate text-xs">
              Draft · v{saved.number}
              {dirty ? " · unsaved changes" : ""}
              {data.credit ? (
                <>
                  {" · remixed from "}
                  <Link
                    href={`/p/${data.credit.slug}`}
                    className="hover:text-fg underline-offset-2 hover:underline"
                  >
                    {data.credit.title}
                  </Link>{" "}
                  by @{data.credit.ownerHandle}
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={openHistory} className="hidden sm:inline-flex">
            History
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDrawer("explain")}>
            <span className="hidden sm:inline">Break it down</span>
            <span className="sm:hidden">Explain</span>
          </Button>
          <Button
            size="sm"
            variant={dirty ? "secondary" : "ghost"}
            onClick={saveByHand}
            disabled={!dirty || busy !== null}
            title="Save (Ctrl/Cmd + S)"
          >
            {busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
          <Button size="sm" onClick={() => void goPublish()} disabled={busy !== null}>
            Publish
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "border-line min-h-0 w-full flex-col lg:flex lg:w-[400px] lg:shrink-0 lg:border-r",
            mobileTab === "chat" ? "flex" : "hidden",
          )}
        >
          <ChatPanel
            items={chat}
            proposal={proposal}
            models={data.models}
            credits={credits}
            inputChars={Object.values(text).reduce((n, t) => n + t.length, 0)}
            ai={data.ai}
            busy={busy}
            onAsk={ask}
            onAccept={acceptProposal}
            onDiscard={discardProposal}
            onToggleFile={(path) =>
              setProposal((p) => {
                if (!p) return p;
                const include = new Set(p.include);
                if (include.has(path)) include.delete(path);
                else include.add(path);
                return { ...p, include };
              })
            }
            onUndo={(versionId) => restore(versionId, "Undid that change.")}
            currentVersionId={saved.versionId}
          />
        </aside>
        <section
          className={cn(
            "min-w-0 flex-1 flex-col lg:flex",
            mobileTab === "chat" ? "hidden" : "flex",
          )}
        >
          {workspace}
        </section>
      </div>

      <nav
        aria-label="Editor views"
        className="border-line bg-ink grid h-14 shrink-0 grid-cols-3 border-t lg:hidden"
      >
        {(["chat", "preview", "code"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={mobileTab === t}
            onClick={() => setMobileTab(t)}
            className={cn(
              "text-sm font-semibold capitalize",
              mobileTab === t ? "text-fg" : "text-faint",
            )}
          >
            {t === "chat" ? (proposal ? "Chat •" : "Chat") : t}
          </button>
        ))}
      </nav>

      {notice ? (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={cn(
            "fixed bottom-20 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[var(--radius-control)] border px-4 py-3 text-sm shadow-2xl lg:bottom-6",
            notice.kind === "error"
              ? "border-danger/50 bg-panel text-fg"
              : "border-line-strong bg-panel text-fg",
          )}
        >
          {notice.text}
        </div>
      ) : null}

      {drawer === "history" ? (
        <HistoryDrawer
          versions={versions}
          currentId={saved.versionId}
          busy={busy !== null}
          onRestore={(v) => restore(v.id, `Restored version ${v.number}.`)}
          onClose={() => setDrawer(null)}
        />
      ) : null}
      {drawer === "explain" ? (
        <ExplainDrawer
          key={saved.versionId}
          versionId={saved.versionId}
          dirty={dirty}
          models={data.models}
          aiAllowed={data.ai.allowed}
          onClose={() => setDrawer(null)}
        />
      ) : null}
    </div>
  );
}

function BinaryInfo({ file, url }: { file?: EditorFile; url?: string }) {
  if (!file) return <p className="text-faint p-6 text-sm">Pick a file to view it.</p>;
  const isImage = /^image\/(png|jpe?g|webp|gif|avif)/.test(file.mime);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      {isImage && url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data: URL of the person's own file
        <img
          src={url}
          alt=""
          className="border-line max-h-64 max-w-full rounded-lg border object-contain"
        />
      ) : null}
      <p className="text-muted text-sm">
        {file.path} · {(file.size / 1024).toFixed(1)} KB
      </p>
      <p className="text-faint max-w-[36ch] text-xs">
        Images and fonts can be used by your code but can&apos;t be edited here.
      </p>
    </div>
  );
}
