"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { LicenseId } from "@/config/licenses";
import { PROJECT_TEXT_LIMITS, UPLOAD_LIMITS } from "@/config/limits";
import { CATEGORIES, STYLES, TOOLS } from "@/config/taxonomy";
import { Button, ButtonLink } from "@/components/ui/button";
import { CheckboxField, Field, Input, Textarea } from "@/components/ui/field";
import { Chip, Select } from "@/components/ui/select";
import { compressCover } from "@/lib/upload/client-read";
import { cn } from "@/lib/utils/cn";
import { track } from "@/lib/monitoring/analytics";

type Props = {
  projectId: string;
  initial: {
    title: string;
    description: string;
    category: string;
    toolUsed: string;
    styles: string[];
    tags: string[];
    licenseId: LicenseId;
    coverUrl: string | null;
  };
  licenses: { id: LicenseId; shortName: string; summary: string }[];
  licenseNote: string | null;
  chain: {
    title: string;
    slug: string;
    ownerHandle: string;
    license: string;
    available: boolean;
  }[];
  rightsStatement: string;
  isRemix: boolean;
};

export function PublishForm({
  projectId,
  initial,
  licenses,
  licenseNote,
  chain,
  rightsStatement,
  isRemix,
}: Props) {
  const router = useRouter();
  const [styles, setStyles] = useState<string[]>(initial.styles.slice(0, 4));
  const [license, setLicense] = useState<LicenseId>(initial.licenseId);
  const [cover, setCover] = useState<{ blob: Blob; url: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [held, setHeld] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (cover) URL.revokeObjectURL(cover.url);
    },
    [cover],
  );

  async function onCover(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      setErrors((x) => ({ ...x, cover: "Use a PNG, JPG, WebP or GIF image." }));
      return;
    }
    const blob = file.type === "image/gif" ? file : await compressCover(file);
    if (blob.size > UPLOAD_LIMITS.coverMaxBytes) {
      setErrors((x) => ({ ...x, cover: "Use an image under 2 MB." }));
      return;
    }
    setErrors(({ cover: _drop, ...rest }) => rest);
    setCover({ blob, url: URL.createObjectURL(blob) });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const data = new FormData(e.currentTarget);
    if (data.get("rightsConfirmed") !== "on") {
      setErrors({ rightsConfirmed: "Confirm this before publishing." });
      return;
    }
    if (!cover && !initial.coverUrl) {
      setErrors({ cover: "Add a cover image." });
      return;
    }
    setErrors({});
    const metadata = {
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? ""),
      category: String(data.get("category") ?? ""),
      toolUsed: String(data.get("toolUsed") ?? ""),
      licenseId: license,
      styles,
      tags: String(data.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      rightsConfirmed: true,
    };
    const body = new FormData();
    body.append("metadata", JSON.stringify(metadata));
    if (cover) body.append("cover", cover.blob);

    setSubmitting(true);
    try {
      const res = await fetch(`/api/editor/${projectId}/publish`, { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as {
        slug?: string;
        status?: string;
        error?: string;
        field?: string | null;
      };
      if (!res.ok || !json.slug) {
        if (json.field) setErrors({ [json.field]: json.error ?? "Check this." });
        setFormError(json.error ?? "Publishing didn't work. Try again.");
        return;
      }
      track("published", {
        remix: isRemix,
        license,
        held: json.status === "pending_review",
      });
      if (json.status === "pending_review") {
        setHeld(json.slug);
        return;
      }
      router.push(`/p/${json.slug}`);
    } catch {
      setFormError("Publishing didn't work. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (held) {
    return (
      <div
        role="status"
        className="border-line bg-panel flex flex-col gap-4 rounded-[var(--radius-card)] border p-6"
      >
        <h2 className="text-xl font-bold">Almost there</h2>
        <p className="text-muted">
          It&apos;s held for a quick review before it shows in the gallery. You&apos;ll find it on
          your profile in the meantime.
        </p>
        <div className="flex gap-2">
          <ButtonLink href={`/p/${held}`}>See it</ButtonLink>
          <ButtonLink href="/drafts" variant="secondary">
            Your drafts
          </ButtonLink>
        </div>
      </div>
    );
  }

  const sectionTitle = "text-lg font-bold text-fg";
  const coverShown = cover?.url ?? initial.coverUrl;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-10" noValidate>
      {chain.length ? (
        <section
          aria-labelledby="credit-heading"
          className="border-line bg-panel/60 flex flex-col gap-3 rounded-[var(--radius-card)] border p-5"
        >
          <h2 id="credit-heading" className="text-fg text-sm font-bold">
            Credit shown on your remix
          </h2>
          <ol className="flex flex-col gap-1.5 text-sm">
            {chain.map((c, i) => (
              <li key={`${c.slug}-${i}`} className="text-muted">
                {i === 0 ? "Remixed from " : "which remixed "}
                {c.available ? (
                  <Link href={`/p/${c.slug}`} className="text-fg hover:underline">
                    {c.title}
                  </Link>
                ) : (
                  <span className="text-fg">{c.title}</span>
                )}{" "}
                by @{c.ownerHandle} <span className="text-faint">· {c.license}</span>
              </li>
            ))}
          </ol>
          <p className="text-faint text-xs">
            This is added automatically and can&apos;t be removed.
          </p>
        </section>
      ) : null}

      {/* Cover */}
      <section className="flex flex-col gap-4" aria-labelledby="cover-heading">
        <h2 id="cover-heading" className={sectionTitle}>
          Cover image
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="border-line bg-panel aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-card)] border sm:w-64">
            {coverShown ? (
              // eslint-disable-next-line @next/next/no-img-element -- object URL or our own /media path
              <img src={coverShown} alt="Cover preview" className="size-full object-cover" />
            ) : (
              <div className="text-faint grid size-full place-items-center p-4 text-center text-sm">
                Add a screenshot
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="w-fit cursor-pointer">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => void onCover(e.target.files)}
              />
              <span className="border-line-strong bg-panel hover:bg-panel-raised inline-flex h-10 items-center rounded-[var(--radius-control)] border px-4 text-sm font-semibold">
                {coverShown ? "Change cover" : "Choose cover"}
              </span>
            </label>
            <p className="text-faint text-sm">
              {cover
                ? "Your new cover."
                : initial.coverUrl
                  ? "Using the original's cover. A screenshot of your version is better."
                  : "Add a screenshot of your project. PNG, JPG, WebP or GIF."}
            </p>
            {errors.cover ? (
              <p role="alert" className="text-danger text-sm">
                {errors.cover}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* Details */}
      <section className="flex flex-col gap-5" aria-labelledby="details-heading">
        <h2 id="details-heading" className={sectionTitle}>
          Details
        </h2>
        <Field id="title" label="Title" error={errors.title}>
          <Input
            id="title"
            name="title"
            required
            defaultValue={initial.title}
            minLength={PROJECT_TEXT_LIMITS.titleMin}
            maxLength={PROJECT_TEXT_LIMITS.titleMax}
            aria-invalid={errors.title ? true : undefined}
          />
        </Field>
        <Field
          id="description"
          label="Description"
          error={errors.description}
          hint={
            isRemix
              ? "What did you change, and what could someone make from it next?"
              : "What is it, and what could someone remix it into?"
          }
        >
          <Textarea
            id="description"
            name="description"
            defaultValue={initial.description}
            maxLength={PROJECT_TEXT_LIMITS.descriptionMax}
            aria-invalid={errors.description ? true : undefined}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="category" label="Category" error={errors.category}>
            <Select id="category" name="category" defaultValue={initial.category} required>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="toolUsed" label="Made with" error={errors.toolUsed}>
            <Select id="toolUsed" name="toolUsed" defaultValue={initial.toolUsed} required>
              {TOOLS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-fg mb-1.5 text-sm font-semibold">Style (up to 4)</legend>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((s) => {
              const on = styles.includes(s.id);
              return (
                <Chip
                  key={s.id}
                  selected={on}
                  disabled={!on && styles.length >= 4}
                  onClick={() =>
                    setStyles((cur) => (on ? cur.filter((x) => x !== s.id) : [...cur, s.id]))
                  }
                >
                  {s.label}
                </Chip>
              );
            })}
          </div>
        </fieldset>
        <Field id="tags" label="Tags" error={errors.tags} hint="Comma separated">
          <Input id="tags" name="tags" maxLength={200} defaultValue={initial.tags.join(", ")} />
        </Field>
      </section>

      {/* License */}
      <section className="flex flex-col gap-4" aria-labelledby="license-heading">
        <h2 id="license-heading" className={sectionTitle}>
          License
        </h2>
        {licenseNote ? <p className="text-muted text-sm">{licenseNote}</p> : null}
        <div
          role="radiogroup"
          aria-labelledby="license-heading"
          className="grid gap-2 sm:grid-cols-2"
        >
          {licenses.map((l) => {
            const on = license === l.id;
            return (
              <label
                key={l.id}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-[var(--radius-control)] border p-3.5 transition-colors",
                  on
                    ? "border-magenta bg-magenta/10"
                    : "border-line bg-panel hover:border-line-strong",
                )}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="license"
                    value={l.id}
                    checked={on}
                    onChange={() => setLicense(l.id)}
                    className="accent-magenta"
                  />
                  <span className="text-fg font-semibold">{l.shortName}</span>
                </span>
                <span className="text-muted text-sm">{l.summary}</span>
              </label>
            );
          })}
        </div>
        {errors.licenseId ? (
          <p role="alert" className="text-danger text-sm">
            {errors.licenseId}
          </p>
        ) : null}
        <CheckboxField id="rightsConfirmed" name="rightsConfirmed" error={errors.rightsConfirmed}>
          {rightsStatement}
        </CheckboxField>
      </section>

      {formError ? (
        <p role="alert" className="text-danger">
          {formError}
        </p>
      ) : null}

      <div className="border-line flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/edit/${projectId}`} className="text-muted hover:text-fg text-sm">
          ← Back to the editor
        </Link>
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? "Publishing…" : isRemix ? "Publish remix" : "Publish project"}
        </Button>
      </div>
    </form>
  );
}
