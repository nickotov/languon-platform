import type { Metadata } from "next";

import { ForgotPasswordPage } from "@/fsd/pages/forgot-password/ui/forgot-password-page";

export const metadata: Metadata = { title: "Reset password · Languon" };

export default function Page() {
  return <ForgotPasswordPage />;
}
