import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_VERSIONS, MINIMUM_AGE } from "@/config/legal";
import { FREE_TRIAL_PROMPTS } from "@/config/plans";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <>
      <h1 className="type-wide text-fg mb-2 text-4xl font-black">Terms of Service</h1>
      <p>Version {LEGAL_VERSIONS.terms}</p>

      <h2>1. Who can use REMAXX</h2>
      <p>
        You must be at least {MINIMUM_AGE} years old to create an account. You&apos;re responsible
        for your account and for everything done with it. Keep your sign-in methods secure and tell
        us if you think someone else is using your account.
      </p>

      <h2>2. What REMAXX is</h2>
      <p>
        REMAXX is a gallery of website, app and UI templates shared by its members, and an editor
        where you can create new projects or remix shared templates, by hand or with the help of AI
        models from third-party providers. REMAXX is for creating your own work and remixing work
        that people have chosen to share under a license. It is not a tool for copying or cloning
        commercial products.
      </p>

      <h2>3. Your content and licenses</h2>
      <p>
        You keep ownership of what you upload or create. When you publish a template you choose a
        license for it (for example MIT, Apache-2.0, CC BY, CC BY-SA, CC0, or REMAXX Personal Use),
        and you confirm that you own the work or have permission to share it under that license.
      </p>
      <p>
        You also give REMAXX a worldwide, non-exclusive, royalty-free license to host, store, copy,
        display, run in a sandboxed preview, and distribute your content on the service, and to let
        other members open and remix it on REMAXX according to the license you chose. This platform
        license lasts while your content is on REMAXX and for a reasonable period after removal for
        backups and legal compliance.
      </p>

      <h3 id="personal-use-license">REMAXX Personal Use license</h3>
      <p>
        If a creator picks REMAXX Personal Use, anyone may view the template, remix it on REMAXX,
        and use the result for personal, non-commercial purposes. Remixes must keep this license and
        credit the creator. Selling it, or using it for a business or client, needs the
        creator&apos;s separate permission.
      </p>

      <h2>4. Remixes and credit</h2>
      <p>
        When you remix a template, your remix keeps a visible credit to every template it came from,
        and you can only publish it under a license compatible with the originals. You may not
        remove or misrepresent these credits.
      </p>

      <h2>5. Acceptable use</h2>
      <p>
        You must follow the <Link href="/legal/acceptable-use">Acceptable Use Policy</Link>. It
        prohibits, among other things, uploading proprietary or leaked code, malware, and anything
        you don&apos;t have the rights to share.
      </p>

      <h2>6. AI features</h2>
      <p>
        AI features send your prompts, any images you attach, and the relevant project files to the
        AI provider you pick. AI output can be wrong, insecure, or similar to existing work. Review
        it before you rely on or publish it; you are responsible for what you publish.
      </p>

      <h2>7. Credits and subscriptions</h2>
      <p>
        AI requests use credits. Every new account gets {FREE_TRIAL_PROMPTS} free AI prompts. The
        editor shows an estimate before you send a request; the credits charged are based on the
        model and how much it reads and writes. If a request fails, times out, or comes back
        unusable, its credits are returned. When you run out, AI requests stop until you have more;
        browsing, editing by hand and publishing stay free.
      </p>
      <p>
        Paid plans are monthly subscriptions billed through Stripe. They renew automatically each
        month until you cancel, which you can do at any time from your billing page; the plan then
        stays active until the end of the period you paid for. Each paid period adds that
        plan&apos;s credits, and credits left at the end of a period expire and don&apos;t roll
        over. Upgrading mid-period charges the prorated difference and adds the difference in
        credits straight away; downgrading takes effect at the next period. We&apos;ll tell you
        before a price change applies to you.
      </p>
      <p>
        Credits have no cash value, can&apos;t be transferred or sold, and aren&apos;t refundable
        except where the law requires. If you think you were charged by mistake, contact us and
        we&apos;ll look into it.
      </p>

      <h2>8. Removal and termination</h2>
      <p>
        We may remove content or suspend accounts that break these terms, the Acceptable Use Policy,
        or the law, and we follow the process in our{" "}
        <Link href="/legal/dmca">copyright policy</Link> for infringement claims, including
        terminating repeat infringers. You can delete your account at any time.
      </p>

      <h2>9. Disclaimers and liability</h2>
      <p>
        REMAXX is provided as is. To the extent the law allows, we disclaim implied warranties and
        limit our liability for indirect or consequential damages. Templates are provided by their
        creators, not by REMAXX.
      </p>

      <h2>10. Changes</h2>
      <p>
        We&apos;ll tell you about material changes to these terms before they take effect.
        Continuing to use REMAXX after that means you accept the new terms.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these terms:{" "}
        <a href={`mailto:${siteConfig.contact.legal}`}>{siteConfig.contact.legal}</a>
      </p>
    </>
  );
}
