"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef } from "react";

export function AuthShell({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <main className="auth-layout">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="brand-link" href="/" aria-label="Languon home">
          Languon
        </Link>
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="auth-title">{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function FormMessage({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "info" | "success";
}) {
  const message = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tone === "error") message.current?.focus();
  }, [tone]);

  return (
    <div
      className={`form-message form-message--${tone}`}
      role={tone === "error" ? "alert" : "status"}
      ref={message}
      tabIndex={-1}
    >
      {children}
    </div>
  );
}

export function AuthLinks({
  mode,
  signupAvailable = true,
}: {
  mode: "login" | "signup";
  signupAvailable?: boolean;
}) {
  if (mode === "login" && !signupAvailable) return null;
  return (
    <p className="auth-switch">
      {mode === "login" ? "New to Languon? " : "Already have an account? "}
      <Link href={mode === "login" ? "/signup" : "/login"}>
        {mode === "login" ? "Create an account" : "Sign in"}
      </Link>
    </p>
  );
}
