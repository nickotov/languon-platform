import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthProvider } from "@/fsd/features/auth";

import "./globals.css";

export const metadata: Metadata = {
  description: "AI-first language learning for students and tutors.",
  title: "Languon",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
