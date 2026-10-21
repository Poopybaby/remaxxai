import Image from "next/image";
import { cn } from "@/lib/utils/cn";

/** Profile picture, or initials on a color derived from the handle so it's stable per person. */
export function Avatar({
  name,
  handle,
  src,
  size = 40,
  className,
}: {
  name: string;
  handle: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={style}
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const hue = [...handle].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 360, 7);
  return (
    <span
      aria-hidden
      className={cn(
        "text-ink inline-grid shrink-0 place-items-center rounded-full font-bold",
        className,
      )}
      style={{ ...style, background: `oklch(0.78 0.14 ${hue})`, fontSize: size * 0.38 }}
    >
      {initials || "?"}
    </span>
  );
}
