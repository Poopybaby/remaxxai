import { OG_CONTENT_TYPE, OG_SIZE, siteCard } from "@/lib/og/card";

export const alt = "REMAXX: remix what inspires you";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return siteCard();
}
