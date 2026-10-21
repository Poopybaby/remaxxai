import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { siteConfig } from "@/config/site";
import "./globals.css";

// Self-hosted Archivo (SIL OFL, see app/fonts/Archivo-OFL.txt): one variable file with
// weight 100–900 and width 62–125%. No request to Google at build or run time.
const archivo = localFont({
  src: "./fonts/archivo-latin-variable.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  style: "normal",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.appUrl),
  title: { default: "REMAXX: remix what inspires you", template: "%s | REMAXX" },
  description: siteConfig.description,
  openGraph: {
    title: "REMAXX",
    description: siteConfig.description,
    siteName: "REMAXX",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#0f0d1e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="bg-magenta text-ink sr-only z-50 rounded-lg px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
