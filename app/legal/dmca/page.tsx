import type { Metadata } from "next";
import { DmcaForm } from "@/components/legal/dmca-form";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Copyright & DMCA" };

export default function DmcaPage() {
  const email = siteConfig.contact.dmca;
  return (
    <>
      <h1 className="type-wide text-fg mb-2 text-4xl font-black">Copyright &amp; DMCA</h1>
      <p>
        REMAXX respects copyright and expects its members to do the same. If you believe something
        on REMAXX infringes your copyright, send us a notice and we&apos;ll review it promptly.
      </p>

      <h2>Filing a takedown notice</h2>
      <p>
        Use the form below, or email <a href={`mailto:${email}`}>{email}</a>. Your notice must
        include:
      </p>
      <ol>
        <li>Your physical or electronic signature.</li>
        <li>A description of the copyrighted work you believe is infringed.</li>
        <li>The REMAXX link(s) to the material you want removed.</li>
        <li>Your name, address, phone number, and email address.</li>
        <li>
          A statement that you have a good faith belief that the use is not authorized by the
          copyright owner, its agent, or the law.
        </li>
        <li>
          A statement that the information in your notice is accurate and, under penalty of perjury,
          that you are the copyright owner or authorized to act on their behalf.
        </li>
      </ol>

      <DmcaForm />

      <h2>What happens next</h2>
      <p>
        We remove or disable access to the material and notify the person who posted it. Remixes
        built from removed material are hidden while an admin reviews them, and their credit line
        shows that the original was removed.
      </p>

      <h2>Counter-notices</h2>
      <p>
        If your content was removed by mistake or misidentification, you can send a counter-notice
        to the same address with your signature, the removed material and where it appeared, a
        statement under penalty of perjury that you believe it was removed by mistake, and your
        consent to the jurisdiction of the federal court for your address. Unless the claimant tells
        us they&apos;ve filed a court action, we may restore the material in 10 to 14 business days.
      </p>

      <h2>Repeat infringers</h2>
      <p>We terminate the accounts of people who repeatedly infringe copyright.</p>

      <h2>Designated agent</h2>
      <p>
        Designated agent details will be published here once registered with the U.S. Copyright
        Office. Until then, send notices to <a href={`mailto:${email}`}>{email}</a>.
      </p>
    </>
  );
}
