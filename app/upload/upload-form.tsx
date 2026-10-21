"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { LICENSE_IDS, LICENSES, type LicenseId } from "@/config/licenses";
import { PROJECT_TEXT_LIMITS, UPLOAD_LIMITS } from "@/config/limits";
import { CATEGORIES, STYLES, TOOLS } from "@/config/taxonomy";
import { Button } from "@/components/ui/button";
import { CheckboxField, Field, Input, Textarea } from "@/components/ui/field";
import { Chip, Select } from "@/components/ui/select";
import { RIGHTS_STATEMENT } from "@/lib/projects/metadata";
import { compressCover, readFileList, readZip } from "@/lib/upload/client-read";
import type { UploadFile, UploadIssue } from "@/lib/upload/types";
import { validateUpload } from "@/lib/upload/validate";
import { cn } from "@/lib/utils/cn";

type Ready = { files: UploadFile[]; totalBytes: number; source: string };

const kb = (n: number) =>
  n < 1024 * 1024
    ? `${Math.max(1, Math.round(n / 1024))} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`;

export function UploadForm() {
  const router = useRouter();
  const [ready, setReady] = useState<Ready | null>(null);
  const [fileIssues, setFileIssues] = useState<UploadIssue[]>([]);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [cover, setCover] = useState<{ blob: Blob; url: string } | null>(null);
  const [styles, setStyles] = useState<string[]>([]);
  const [license, setLicense] = useState<LicenseId>("mit");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const folderInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, []);
  useEffect(
    () => () => {
      if (cover) URL.revokeObjectURL(cover.url);
    },
    [cover],
  );

  async function ingest(
    load: () => Promise<{ entries: Awaited<ReturnType<typeof readFileList>>; source: string }>,
  ) {
    setReading(true);
    setFileIssues([]);
    setReady(null);
    try {
      const { entries, source } = await load();
      const result = validateUpload(entries);
      if (result.ok) setReady({ files: result.files, totalBytes: result.totalBytes, source });
      else setFileIssues(result.issues);
    } catch (err) {
      setFileIssues([
        { message: err instanceof Error ? err.message : "We couldn't read those files." },
      ]);
    } finally {
      setReading(false);
    }
  }

  function onPick(list: FileList | null, kind: "zip" | "folder" | "html") {
    if (!list || list.length === 0) return;
    void ingest(async () => {
      if (kind === "zip") return { entries: await readZip(list[0]!), source: list[0]!.name };
      const entries = await readFileList(list);
      return { entries, source: kind === "folder" ? "folder" : list[0]!.name };
    });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const first = files[0]!;
    if (files.length === 1 && /\.zip$/i.test(first.name)) onPick(e.dataTransfer.files, "zip");
    else
      void ingest(async () => ({
        entries: await readFileList(files),
        source: `${files.length} files`,
      }));
  }

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
    const nextErrors: Record<string, string> = {};
    if (!ready) nextErrors.files = "Add your project files.";
    if (!cover) nextErrors.cover = "Add a cover image.";
    if (data.get("rightsConfirmed") !== "on")
      nextErrors.rightsConfirmed = "Confirm that you have the rights to share this.";
    if (
      ready &&
      cover &&
      ready.totalBytes + cover.blob.size > UPLOAD_LIMITS.maxTotalBytes + 400 * 1024
    ) {
      nextErrors.files = "Files plus cover are too large. Compress some images and try again.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !ready || !cover) return;

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
    for (const f of ready.files) {
      body.append("path", f.path);
      body.append("file", new Blob([new Uint8Array(f.bytes)], { type: f.mime }));
    }
    body.append("cover", cover.blob);

    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as {
        slug?: string;
        error?: string;
        issues?: { path?: string; message: string }[];
      };
      if (!res.ok || !json.slug) {
        const fieldErrors: Record<string, string> = {};
        const fileLevel: UploadIssue[] = [];
        for (const issue of json.issues ?? []) {
          if (
            issue.path &&
            [
              "title",
              "description",
              "category",
              "toolUsed",
              "licenseId",
              "styles",
              "tags",
              "cover",
              "rightsConfirmed",
            ].includes(issue.path)
          ) {
            fieldErrors[issue.path] = issue.message;
          } else fileLevel.push(issue);
        }
        setErrors(fieldErrors);
        if (fileLevel.length) setFileIssues(fileLevel);
        setFormError(json.error ?? "Upload failed. Try again.");
        return;
      }
      router.push(`/p/${json.slug}`);
    } catch {
      setFormError("Upload failed. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const sectionTitle = "text-lg font-bold text-fg";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-10" noValidate>
      {/* Files */}
      <section className="flex flex-col gap-4" aria-labelledby="files-heading">
        <h2 id="files-heading" className={sectionTitle}>
          Project files
        </h2>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center gap-4 rounded-[var(--radius-card)] border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging ? "border-cyan bg-cyan/5" : "border-line-strong bg-panel/50",
          )}
        >
          <p className="text-fg">Drop a .zip, a folder&apos;s files, or one HTML file here</p>
          <div className="flex flex-wrap justify-center gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".zip,application/zip"
                className="sr-only"
                onChange={(e) => onPick(e.target.files, "zip")}
              />
              <span className="border-line-strong bg-panel hover:bg-panel-raised inline-flex h-10 items-center rounded-[var(--radius-control)] border px-4 text-sm font-semibold">
                Choose a .zip
              </span>
            </label>
            <label className="cursor-pointer">
              <input
                ref={folderInput}
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => onPick(e.target.files, "folder")}
              />
              <span className="border-line-strong bg-panel hover:bg-panel-raised inline-flex h-10 items-center rounded-[var(--radius-control)] border px-4 text-sm font-semibold">
                Choose a folder
              </span>
            </label>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".html,.htm,text/html"
                className="sr-only"
                onChange={(e) => onPick(e.target.files, "html")}
              />
              <span className="border-line-strong bg-panel hover:bg-panel-raised inline-flex h-10 items-center rounded-[var(--radius-control)] border px-4 text-sm font-semibold">
                Choose an HTML file
              </span>
            </label>
          </div>
          <p className="text-faint max-w-[52ch] text-sm">
            Static sites only: HTML, CSS, JavaScript, images and fonts, up to{" "}
            {UPLOAD_LIMITS.maxTotalBytes / 1024 / 1024} MB. Built a React or Vue app? Upload its
            build output folder (usually <code>dist</code>).
          </p>
        </div>

        {reading ? (
          <p role="status" className="text-muted text-sm">
            Reading files…
          </p>
        ) : null}

        {ready ? (
          <div
            role="status"
            className="border-success/40 bg-success/5 rounded-[var(--radius-control)] border p-4"
          >
            <p className="text-fg font-semibold">
              {ready.files.length} {ready.files.length === 1 ? "file" : "files"},{" "}
              {kb(ready.totalBytes)}, ready to upload
            </p>
            <ul className="text-muted mt-2 max-h-40 overflow-auto font-mono text-[13px]">
              {ready.files.slice(0, 50).map((f) => (
                <li key={f.path}>{f.path}</li>
              ))}
              {ready.files.length > 50 ? <li>and {ready.files.length - 50} more</li> : null}
            </ul>
          </div>
        ) : null}

        {fileIssues.length || errors.files ? (
          <div
            role="alert"
            className="border-danger/50 bg-danger/10 rounded-[var(--radius-control)] border p-4 text-sm"
          >
            <p className="text-fg font-semibold">{errors.files ?? "Fix these and try again:"}</p>
            {fileIssues.length ? (
              <ul className="text-muted mt-2 list-disc space-y-1 pl-5">
                {fileIssues.map((issue, i) => (
                  <li key={i}>
                    {issue.path ? <code className="text-fg">{issue.path}</code> : null}
                    {issue.path ? ": " : ""}
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Cover */}
      <section className="flex flex-col gap-4" aria-labelledby="cover-heading">
        <h2 id="cover-heading" className={sectionTitle}>
          Cover image
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="border-line bg-panel aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-card)] border sm:w-64">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not an optimizable asset
              <img src={cover.url} alt="Cover preview" className="size-full object-cover" />
            ) : (
              <div className="text-faint grid size-full place-items-center p-4 text-center text-sm">
                A screenshot of your project works best
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
                {cover ? "Change cover" : "Choose cover"}
              </span>
            </label>
            <p className="text-faint text-sm">PNG, JPG, WebP or GIF. We resize it for you.</p>
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
            minLength={PROJECT_TEXT_LIMITS.titleMin}
            maxLength={PROJECT_TEXT_LIMITS.titleMax}
            aria-invalid={errors.title ? true : undefined}
          />
        </Field>
        <Field
          id="description"
          label="Description"
          error={errors.description}
          hint="What is it, and what would someone remix it into?"
        >
          <Textarea
            id="description"
            name="description"
            maxLength={PROJECT_TEXT_LIMITS.descriptionMax}
            aria-invalid={errors.description ? true : undefined}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="category" label="Category" error={errors.category}>
            <Select id="category" name="category" defaultValue="" required>
              <option value="" disabled>
                Choose a category
              </option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="toolUsed" label="Made with" error={errors.toolUsed}>
            <Select id="toolUsed" name="toolUsed" defaultValue="" required>
              <option value="" disabled>
                Choose a tool
              </option>
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
        <Field
          id="tags"
          label="Tags"
          error={errors.tags}
          hint="Comma separated, e.g. coffee, booking, portfolio"
        >
          <Input id="tags" name="tags" maxLength={200} />
        </Field>
      </section>

      {/* License */}
      <section className="flex flex-col gap-4" aria-labelledby="license-heading">
        <h2 id="license-heading" className={sectionTitle}>
          License
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="license-heading"
          className="grid gap-2 sm:grid-cols-2"
        >
          {LICENSE_IDS.map((id) => {
            const l = LICENSES[id];
            const on = license === id;
            return (
              <label
                key={id}
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
                    value={id}
                    checked={on}
                    onChange={() => setLicense(id)}
                    className="accent-magenta"
                  />
                  <span className="text-fg font-semibold">{l.shortName}</span>
                </span>
                <span className="text-muted text-sm">{l.summary}</span>
              </label>
            );
          })}
        </div>
        <CheckboxField id="rightsConfirmed" name="rightsConfirmed" error={errors.rightsConfirmed}>
          {RIGHTS_STATEMENT}
        </CheckboxField>
      </section>

      {formError ? (
        <p role="alert" className="text-danger">
          {formError}
        </p>
      ) : null}

      <div className="border-line flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-faint text-sm">
          Uploads are checked automatically. Some are held for a quick review first.
        </p>
        <Button type="submit" size="lg" disabled={submitting || reading}>
          {submitting ? "Publishing…" : "Publish template"}
        </Button>
      </div>
    </form>
  );
}
