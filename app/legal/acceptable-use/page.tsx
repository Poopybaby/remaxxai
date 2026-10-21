import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_VERSIONS } from "@/config/legal";

export const metadata: Metadata = { title: "Acceptable Use Policy" };

export default function AcceptableUsePage() {
  return (
    <>
      <h1 className="type-wide text-fg mb-2 text-4xl font-black">Acceptable Use Policy</h1>
      <p>Version {LEGAL_VERSIONS.acceptableUse}</p>
      <p>
        REMAXX works because people share their work openly and credit each other. These rules keep
        it that way. They apply to everything you upload, publish, prompt, or remix.
      </p>

      <h2>Only share what you have the right to share</h2>
      <ul>
        <li>
          Don&apos;t upload proprietary, confidential, or leaked source code, designs, or assets.
        </li>
        <li>
          Don&apos;t upload code, images, fonts, or text you don&apos;t own or don&apos;t have
          permission to share under the license you pick.
        </li>
        <li>
          Don&apos;t use REMAXX to copy, clone, or reverse engineer commercial apps or websites, or
          to recreate another company&apos;s branded product.
        </li>
        <li>
          Don&apos;t remove or falsify the credit line on a remix, or relicense work in a way its
          license forbids.
        </li>
      </ul>

      <h2>Keep it safe</h2>
      <ul>
        <li>
          No malware, crypto miners, exploits, or code designed to harm visitors or their devices.
        </li>
        <li>
          No phishing pages, fake login or payment forms, or anything meant to collect credentials
          or payment details.
        </li>
        <li>
          No attempts to escape the preview sandbox, attack REMAXX, or access other people&apos;s
          accounts or data.
        </li>
        <li>
          Don&apos;t upload secrets such as API keys, passwords, or private keys, even your own.
        </li>
      </ul>

      <h2>Keep it respectful</h2>
      <ul>
        <li>
          No sexual content, graphic violence, hate, harassment, or content targeting private
          individuals.
        </li>
        <li>No impersonation of people, brands, or organizations.</li>
        <li>No spam, fake engagement, or misleading templates.</li>
      </ul>

      <h2>Use AI features fairly</h2>
      <ul>
        <li>Don&apos;t use prompts to generate content this policy prohibits.</li>
        <li>
          Don&apos;t automate requests, share accounts to pool credits, or work around rate limits
          or credit limits.
        </li>
      </ul>

      <h2>What happens if rules are broken</h2>
      <p>
        We may remove content, limit features, or suspend accounts. Anyone can report a template
        with the report button on its page; copyright owners can also use our{" "}
        <Link href="/legal/dmca">DMCA process</Link>.
      </p>
    </>
  );
}
