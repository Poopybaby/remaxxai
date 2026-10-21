import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getViewerContext } from "@/lib/auth/viewer";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Upload a template", robots: { index: false } };

export default function UploadPage() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="type-wide text-4xl font-black">Upload a template</h1>
        <p className="text-muted max-w-[60ch]">
          Share a site, tool or UI kit so others can remix it. You keep the rights; the license you
          pick says what others can do with it.
        </p>
      </div>
      <Suspense
        fallback={<div className="bg-panel h-[36rem] rounded-[var(--radius-card)]" aria-hidden />}
      >
        <UploadGate />
      </Suspense>
    </section>
  );
}

async function UploadGate() {
  const ctx = await getViewerContext();
  if (ctx.status === "anonymous") redirect("/login?next=/upload");
  if (ctx.status === "needs_onboarding") redirect("/onboarding?next=/upload");
  return <UploadForm />;
}
