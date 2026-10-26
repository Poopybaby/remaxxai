"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { DiffView, lineStats } from "@/components/editor/diff-view";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AI_LIMITS } from "@/config/limits";
import { modelAllowed } from "@/config/plans";
import { estimateCredits } from "@/lib/billing/estimate";
import type { FileChange } from "@/lib/ai/edit-protocol";
import { firstPromptKey, parseHandoff, type Handoff } from "@/lib/editor/first-prompt";
import { cn } from "@/lib/utils/cn";

export type ChatItem = {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: "ok" | "error" | "blocked";
  images?: number;
  applied?: { files: number; undoTo: string };
  discarded?: boolean;
};

export type Proposal = {
  replyId: string;
  summary: string;
  changes: FileChange[];
  problems: string[];
  include: Set<string>;
};

export type ModelOption = {
  id: string;
  label: string;
  vision: boolean;
  blurb: string;
  tier: "starter" | "pro";
  inputPerMTok: number;
  outputPerMTok: number;
  available: boolean;
};

export type Credits = {
  balance: number;
  trialPrompts: number;
  planName: string | null;
  modelTier: "starter" | "pro";
};

const DEFAULT_INTRO = {
  title: "What do you want to change?",
  body: "Describe it in plain words. You'll see exactly what the AI changes before anything is saved, and you can undo any step.",
  suggestions: [
    "Make it dark mode with glowing accents",
    "Change the colors to a sunset palette",
    "Add a contact section at the bottom",
    "Make the headline bigger and bolder",
    "Translate all the text to Spanish",
  ],
};

const MODEL_KEY = "remaxx:model";
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 900 * 1024;

type Attached = { url: string; base64: string };

/** Shrinks a picture in the browser (max 1280px, WebP) so it fits the request size limit. */
async function prepareImage(file: File): Promise<Attached> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.5]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", quality));
    if (blob && blob.size <= MAX_IMAGE_BYTES) {
      const url = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
      return { url, base64: url.slice(url.indexOf(",") + 1) };
    }
  }
  throw new Error("too big");
}

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function speechRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};

function readRememberedModel(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}

export function ChatPanel({
  items,
  proposal,
  models,
  credits,
  inputChars,
  ai,
  busy,
  onAsk,
  onAccept,
  onDiscard,
  onToggleFile,
  onUndo,
  currentVersionId,
  projectId,
  intro = DEFAULT_INTRO,
  placeholder = "Describe a change, e.g. “make the buttons rounder and pink”",
  sendLabel = "Send",
}: {
  items: ChatItem[];
  proposal: Proposal | null;
  models: ModelOption[];
  credits: Credits;
  inputChars: number;
  ai: { allowed: true } | { allowed: false; reason: string };
  busy: null | "ai" | "save" | "restore";
  onAsk: (prompt: string, modelId: string, images: { base64: string }[]) => void;
  onAccept: () => void;
  onDiscard: () => void;
  onToggleFile: (path: string) => void;
  onUndo: (versionId: string) => void;
  currentVersionId: string;
  projectId: string;
  /** The empty state: heading, explanation and clickable suggestions. */
  intro?: { title: string; body: string; suggestions: readonly string[] };
  placeholder?: string;
  sendLabel?: string;
}) {
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<Attached[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const usable = (m: ModelOption) => m.available && modelAllowed(m.tier, credits.modelTier);
  const firstAvailable = models.find(usable)?.id ?? models[0]?.id ?? "";
  // Browser-only facts, read after hydration so the server and browser render the same thing.
  const canListen = useSyncExternalStore(
    noSubscribe,
    () => speechRecognition() !== null,
    () => false,
  );
  const remembered = useSyncExternalStore(noSubscribe, readRememberedModel, () => null);
  const [picked, setPicked] = useState<string | null>(null);
  const modelId =
    picked ??
    (remembered && models.some((m) => m.id === remembered && usable(m))
      ? remembered
      : firstAvailable);
  // What Create handed over: a prompt to send right away, or a description to fill in.
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    let handoff: Handoff | null = null;
    try {
      const key = firstPromptKey(projectId);
      handoff = parseHandoff(sessionStorage.getItem(key) ?? "");
      sessionStorage.removeItem(key);
    } catch {
      // Storage blocked: start empty.
    }
    if (!handoff) return;
    const chosen = handoff.modelId ? models.find((m) => m.id === handoff.modelId) : undefined;
    if (handoff.send && ai.allowed && chosen && usable(chosen)) {
      onAsk(handoff.prompt, chosen.id, handoff.images ?? []);
      return;
    }
    // Couldn't send it (model no longer available, etc.): leave it in the box to review.
    // Reading browser storage has to happen after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrompt(handoff.prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, on arrival
  }, []);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [items.length, proposal, busy]);

  const model = models.find((m) => m.id === modelId);
  // What this request will cost, and how it will be paid for (credits or a free prompt).
  const estimate = model
    ? estimateCredits(
        model,
        "edit",
        inputChars + prompt.length + images.length * 3000,
        AI_LIMITS.edit.maxOutputTokens,
      )
    : null;
  const pay: "credits" | "trial" | "none" =
    estimate && credits.balance >= estimate.typical && credits.balance > 0
      ? "credits"
      : credits.trialPrompts > 0 && model?.tier === "starter"
        ? "trial"
        : "none";
  const disabled = !ai.allowed || busy !== null || !model || !usable(model) || pay === "none";

  function pickModel(id: string) {
    setPicked(id);
    try {
      localStorage.setItem(MODEL_KEY, id);
    } catch {
      // Not critical.
    }
    if (!models.find((m) => m.id === id)?.vision) setImages([]);
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = prompt.trim();
    if (!text || disabled) return;
    recognition.current?.stop();
    onAsk(
      text,
      modelId,
      images.map((i) => ({ base64: i.base64 })),
    );
    setPrompt("");
    setImages([]);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
  }

  function toggleVoice() {
    const Ctor = speechRecognition();
    if (!Ctor) return;
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = false;
    const start = prompt;
    let heard = "";
    r.onresult = (event) => {
      heard = Array.from(event.results)
        .filter((res) => res.isFinal)
        .map((res) => res[0]?.transcript ?? "")
        .join(" ");
      setPrompt(`${start}${start && heard ? " " : ""}${heard}`.slice(0, 2000));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  }

  async function addImages(files: FileList | null) {
    setImageError(null);
    const list = Array.from(files ?? []).slice(0, MAX_IMAGES - images.length);
    for (const f of list) {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) {
        setImageError("Use PNG, JPG, WebP or GIF images.");
        continue;
      }
      try {
        const img = await prepareImage(f);
        setImages((cur) => (cur.length < MAX_IMAGES ? [...cur, img] : cur));
      } catch {
        setImageError("That image is too large even after shrinking it.");
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {items.length === 0 && !proposal ? (
          <div className="flex flex-col gap-3 pt-2">
            <p className="text-fg font-semibold">{intro.title}</p>
            <p className="text-muted text-sm">{intro.body}</p>
            <div className="flex flex-wrap gap-2">
              {intro.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPrompt(s)}
                  className="border-line text-muted hover:border-cyan/50 hover:text-fg rounded-full border px-3 py-1.5 text-left text-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {items.map((item) => (
          <Message
            key={item.id}
            item={item}
            onUndo={onUndo}
            canUndo={busy === null}
            currentVersionId={currentVersionId}
          />
        ))}

        {busy === "ai" ? (
          <div className="text-muted flex items-center gap-2 text-sm" role="status">
            <span className="bg-cyan size-2 animate-pulse rounded-full" aria-hidden />
            {model?.label ?? "The AI"} is working on it. Bigger changes can take up to a minute.
          </div>
        ) : null}

        {proposal ? (
          <ProposalCard
            proposal={proposal}
            busy={busy !== null}
            onAccept={onAccept}
            onDiscard={onDiscard}
            onToggle={onToggleFile}
          />
        ) : null}
        <div ref={bottom} />
      </div>

      <form onSubmit={submit} className="border-line flex flex-col gap-2 border-t p-3">
        {!ai.allowed ? (
          <p className="text-muted bg-panel rounded-lg px-3 py-2 text-sm">{ai.reason}</p>
        ) : null}
        {images.length ? (
          <div className="flex gap-2">
            {images.map((img, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview of an attached picture */}
                <img
                  src={img.url}
                  alt={`Attached image ${i + 1}`}
                  className="border-line size-14 rounded-lg border object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}
                  className="bg-ink border-line-strong absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border text-xs"
                  aria-label={`Remove image ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {imageError ? <p className="text-danger text-xs">{imageError}</p> : null}
        <label htmlFor="prompt" className="sr-only">
          Describe a change
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, 2000))}
          onKeyDown={onKey}
          rows={3}
          disabled={!ai.allowed}
          placeholder={listening ? "Listening… speak your change" : placeholder}
          className="bg-panel border-line focus:border-cyan/60 placeholder:text-faint min-h-20 w-full resize-none rounded-[var(--radius-control)] border px-3 py-2.5 text-[15px] outline-none disabled:opacity-60"
        />
        <div className="flex items-center gap-1.5">
          <label htmlFor="model" className="sr-only">
            AI model
          </label>
          <select
            id="model"
            value={modelId}
            onChange={(e) => pickModel(e.target.value)}
            disabled={!ai.allowed}
            className="bg-panel border-line h-9 min-w-0 flex-1 rounded-lg border px-2 text-sm"
            title={model?.blurb}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id} disabled={!usable(m)}>
                {m.label}
                {!m.available
                  ? " (not set up)"
                  : !modelAllowed(m.tier, credits.modelTier)
                    ? " (Pro plan)"
                    : ""}
              </option>
            ))}
          </select>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => addImages(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={disabled || !model?.vision || images.length >= MAX_IMAGES}
            title={
              model?.vision
                ? "Attach a reference image"
                : `${model?.label ?? "This model"} can't read images`
            }
            className="text-muted hover:text-fg hover:bg-panel grid size-9 place-items-center rounded-lg disabled:opacity-40"
            aria-label="Attach an image"
          >
            <ImageIcon />
          </button>
          {canListen ? (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={!ai.allowed}
              aria-pressed={listening}
              className={cn(
                "grid size-9 place-items-center rounded-lg disabled:opacity-40",
                listening ? "bg-magenta text-ink" : "text-muted hover:text-fg hover:bg-panel",
              )}
              aria-label={listening ? "Stop listening" : "Speak your change"}
            >
              <MicIcon />
            </button>
          ) : null}
          <Button type="submit" size="sm" disabled={disabled || !prompt.trim()}>
            {busy === "ai" ? "Working…" : sendLabel}
          </Button>
        </div>
        <p className="text-faint flex flex-wrap items-center justify-between gap-x-3 text-xs">
          <span>{model?.blurb}</span>
          {ai.allowed && estimate ? (
            pay === "credits" ? (
              <span>
                About {estimate.typical} credit{estimate.typical === 1 ? "" : "s"} ·{" "}
                {credits.balance.toLocaleString()} left
              </span>
            ) : pay === "trial" ? (
              <span className="text-cyan">Free prompt · {credits.trialPrompts} left</span>
            ) : (
              <span className="text-fg">
                {credits.trialPrompts > 0
                  ? "Free prompts work with Starter models. "
                  : "Not enough credits. "}
                <Link href="/pricing" className="text-magenta underline underline-offset-2">
                  See plans
                </Link>
              </span>
            )
          ) : null}
        </p>
      </form>
    </div>
  );
}

function Message({
  item,
  onUndo,
  canUndo,
  currentVersionId,
}: {
  item: ChatItem;
  onUndo: (versionId: string) => void;
  canUndo: boolean;
  currentVersionId: string;
}) {
  if (item.role === "user") {
    return (
      <div className="bg-panel-raised text-fg ml-8 rounded-2xl rounded-br-md px-3.5 py-2.5 text-[15px] whitespace-pre-wrap">
        {item.text}
        {item.images ? (
          <span className="text-faint block text-xs">
            + {item.images} image{item.images > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "mr-4 rounded-2xl rounded-bl-md border px-3.5 py-2.5 text-[15px]",
        item.status === "ok" ? "border-line text-muted" : "border-danger/40 text-fg",
        item.discarded && "opacity-60",
      )}
    >
      <p className="whitespace-pre-wrap">{item.text}</p>
      {item.applied ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-success text-xs font-semibold">
            ✓ Applied to {item.applied.files} file{item.applied.files > 1 ? "s" : ""}
          </span>
          {item.applied.undoTo !== currentVersionId ? (
            <button
              type="button"
              disabled={!canUndo}
              onClick={() => onUndo(item.applied!.undoTo)}
              className="text-muted hover:text-fg text-xs underline underline-offset-2 disabled:opacity-50"
            >
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProposalCard({
  proposal,
  busy,
  onAccept,
  onDiscard,
  onToggle,
}: {
  proposal: Proposal;
  busy: boolean;
  onAccept: () => void;
  onDiscard: () => void;
  onToggle: (path: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(
    proposal.changes.length === 1 ? proposal.changes[0]!.path : null,
  );
  return (
    <section
      aria-label="Proposed changes"
      className="border-cyan/40 bg-panel overflow-hidden rounded-[var(--radius-card)] border"
    >
      <div className="flex flex-col gap-1.5 p-3.5">
        <p className="text-cyan text-xs font-semibold tracking-wide uppercase">
          Review the changes
        </p>
        <p className="text-fg text-[15px]">{proposal.summary}</p>
        {proposal.problems.map((p, i) => (
          <p key={i} className="text-xs text-amber-300">
            {p}
          </p>
        ))}
      </div>
      <ul className="border-line divide-line divide-y border-t">
        {proposal.changes.map((ch) => {
          const stats = lineStats(ch.before, ch.after);
          const isOpen = open === ch.path;
          return (
            <li key={ch.path}>
              <div className="flex items-center gap-2 px-3 py-2">
                <input
                  type="checkbox"
                  checked={proposal.include.has(ch.path)}
                  onChange={() => onToggle(ch.path)}
                  aria-label={`Include changes to ${ch.path}`}
                  className="accent-magenta size-4"
                />
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : ch.path)}
                  aria-expanded={isOpen}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm"
                >
                  <span className="text-fg truncate font-mono text-[13px]">
                    {ch.path}
                    {ch.kind !== "modified" ? (
                      <span className="text-faint ml-1.5 font-sans text-xs">({ch.kind})</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-xs">
                    <span className="text-success">+{stats.added}</span>{" "}
                    <span className="text-danger">−{stats.removed}</span>
                  </span>
                </button>
              </div>
              {isOpen ? <DiffView before={ch.before} after={ch.after} /> : null}
            </li>
          );
        })}
      </ul>
      <div className="border-line flex justify-end gap-2 border-t p-3">
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={busy}>
          Discard
        </Button>
        <Button size="sm" onClick={onAccept} disabled={busy || proposal.include.size === 0}>
          {busy
            ? "Applying…"
            : `Apply ${proposal.include.size === proposal.changes.length ? "all" : proposal.include.size}`}
        </Button>
      </div>
    </section>
  );
}

function ImageIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <circle cx="7.5" cy="8.5" r="1.5" />
      <path d="m4 15 4.5-4.5 3 3L14 11l3 3" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <rect x="7" y="2.5" width="6" height="10" rx="3" />
      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
    </svg>
  );
}
