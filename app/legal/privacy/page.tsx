import type { Metadata } from "next";
import { LEGAL_VERSIONS } from "@/config/legal";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <>
      <h1 className="type-wide text-fg mb-2 text-4xl font-black">Privacy Policy</h1>
      <p>Version {LEGAL_VERSIONS.privacy}</p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your email address, the handle and display name you
          choose, and, if you sign in with Google or GitHub, your name and profile picture from that
          provider.
        </li>
        <li>
          <strong>Confirmations:</strong> that you confirmed you&apos;re 18 or older and accepted
          our terms, with the date and document version.
        </li>
        <li>
          <strong>Content:</strong> templates, remixes, images, and prompts you upload or write.
        </li>
        <li>
          <strong>Usage:</strong> AI requests, credit usage, and basic technical logs used for
          security, abuse prevention, and billing.
        </li>
        <li>
          <strong>Waitlist:</strong> the email address you give us, used only to send your invite.
        </li>
      </ul>

      <h2>AI providers</h2>
      <p>
        When you use an AI feature, your prompt, attached images, and the relevant project files are
        sent to the provider of the model you choose: Anthropic (Claude), OpenAI (ChatGPT), Google
        (Gemini), or DeepSeek. Each provider processes that data under its own terms.{" "}
        <strong>DeepSeek processes data on servers in the People&apos;s Republic of China.</strong>{" "}
        If you don&apos;t want your data processed there, choose a different model.
      </p>

      <h2>Service providers</h2>
      <p>
        We use providers to run REMAXX, including hosting (Vercel), database, sign-in and file
        storage (Supabase), rate limiting (Upstash), email (Resend), payments (Stripe), and error
        monitoring and analytics. They process data on our behalf.
      </p>

      <h2>What we don&apos;t do</h2>
      <p>We don&apos;t sell your personal information.</p>

      <h2>Your choices</h2>
      <p>
        You can edit your profile at any time and delete your account, which removes your profile
        and the content attached to it, subject to backups and legal obligations. To ask for a copy
        of your data or to have it deleted, email{" "}
        <a href={`mailto:${siteConfig.contact.privacy}`}>{siteConfig.contact.privacy}</a>.
      </p>
    </>
  );
}
