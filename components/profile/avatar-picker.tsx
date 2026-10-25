"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { chooseAvatarAction, type AvatarState } from "@/app/actions/profile";
import { DEFAULT_AVATARS } from "@/config/avatars";
import { squareAvatar } from "@/lib/upload/client-read";
import { cn } from "@/lib/utils/cn";

const initial: AvatarState = { error: null, url: null };

/**
 * Profile picture settings: one of the REMAXX crew, or your own upload. Each choice saves
 * straight away.
 */
export function AvatarPicker({ current }: { current: string | null }) {
  const router = useRouter();
  const [state, choose, choosing] = useActionState(chooseAvatarAction, initial);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The newest change wins: an upload after a pick, or a pick after an upload.
  const shown = (uploading ? null : uploaded) ?? state.url ?? current;
  const crew = DEFAULT_AVATARS.find((a) => a.url === shown);

  async function onFile(list: FileList | null) {
    const file = list?.[0];
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      setUploadError("Use a PNG, JPG, WebP or GIF image.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append("file", await squareAvatar(file));
      const res = await fetch("/api/profile/avatar", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) setUploadError(json.error ?? "That didn't work. Try again.");
      else {
        setUploaded(json.url);
        router.refresh();
      }
    } catch {
      setUploadError("We couldn't read that image. Try a different one.");
    } finally {
      setUploading(false);
    }
  }

  const error = uploadError ?? state.error;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <div className="border-line bg-panel relative size-24 shrink-0 overflow-hidden rounded-full border">
          {shown ? <Image src={shown} alt="" fill sizes="96px" className="object-cover" /> : null}
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-fg font-semibold">
            {crew ? `${crew.name}` : shown ? "Your own picture" : "No picture yet"}
          </p>
          <p className="text-muted max-w-[44ch] text-sm">
            {crew ? crew.tagline : "Shown on your profile, your templates and your remixes."}
          </p>
        </div>
      </div>

      <form action={choose} className="flex flex-col gap-2">
        <p id="crew-label" className="text-fg text-sm font-semibold">
          Pick one of the REMAXX crew
        </p>
        <div role="group" aria-labelledby="crew-label" className="flex flex-wrap gap-3">
          {DEFAULT_AVATARS.map((a) => {
            const on = shown === a.url;
            return (
              <button
                key={a.id}
                type="submit"
                name="avatar"
                value={a.id}
                aria-pressed={on}
                disabled={choosing || uploading}
                title={a.tagline}
                className={cn(
                  "group flex w-20 flex-col items-center gap-1.5 rounded-[var(--radius-control)] p-1.5 transition-colors",
                  on ? "bg-magenta/10" : "hover:bg-panel",
                )}
              >
                <span
                  className={cn(
                    "relative size-16 overflow-hidden rounded-full border-2 transition-transform group-hover:scale-105",
                    on ? "border-magenta" : "border-transparent",
                  )}
                >
                  <Image src={a.url} alt="" fill sizes="64px" className="object-cover" />
                </span>
                <span className={cn("text-xs font-semibold", on ? "text-fg" : "text-muted")}>
                  {a.name}
                </span>
              </button>
            );
          })}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <label className="w-fit cursor-pointer">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => void onFile(e.target.files)}
          />
          <span className="border-line-strong bg-panel hover:bg-panel-raised inline-flex h-10 items-center rounded-[var(--radius-control)] border px-4 text-sm font-semibold">
            {uploading ? "Uploading…" : "Upload your own"}
          </span>
        </label>
        <p className="text-faint text-sm">Square works best. We crop and resize it for you.</p>
      </div>

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : choosing ? (
        <p role="status" className="text-muted text-sm">
          Saving…
        </p>
      ) : null}
    </div>
  );
}
