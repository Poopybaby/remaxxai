import { LEGAL_PAGES_ARE_DRAFTS } from "@/config/legal";

export function DraftBanner() {
  if (!LEGAL_PAGES_ARE_DRAFTS) return null;
  return (
    <div
      role="note"
      className="border-danger/60 bg-danger/10 text-fg rounded-[var(--radius-control)] border px-4 py-3 text-sm"
    >
      <strong className="font-semibold">Draft, pending legal review.</strong> This page is a working
      draft and has not been reviewed by a lawyer. It will change before REMAXX launches publicly.
    </div>
  );
}
