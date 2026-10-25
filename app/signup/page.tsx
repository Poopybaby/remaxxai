import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Join REMAXX free: remix AI-built sites and tools, or create your own.",
};

export default function SignupPage() {
  return <AuthPage mode="signup" />;
}
