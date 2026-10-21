import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="mx-auto flex w-full max-w-lg flex-1 flex-col items-start justify-center gap-5 px-4 py-20">
      <h1 className="type-wide text-4xl font-black">Nothing here</h1>
      <p className="text-muted">
        This page doesn&apos;t exist, or it was removed. Check the link, or head back to the start.
      </p>
      <ButtonLink href="/" variant="secondary">
        Go to the home page
      </ButtonLink>
    </section>
  );
}
