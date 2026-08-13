"use client";

import { ForgotPasswordRequestSchema } from "@languon/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { authApi, authErrorMessage } from "@/fsd/shared/api/auth-api";

import { useAuth } from "../model/auth-provider";
import { FormMessage } from "./auth-shell";
import { CapabilityState } from "./capability-state";

export function ForgotPasswordForm() {
  const router = useRouter();
  const { capabilities } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = ForgotPasswordRequestSchema.safeParse({
      email: new FormData(event.currentTarget).get("email"),
    });
    if (!parsed.success) {
      setError("Enter a valid email address.");
      return;
    }

    setPending(true);
    try {
      const response = await authApi.forgotPassword(parsed.data);
      router.push(
        `/reset-password?flowId=${encodeURIComponent(response.recovery.flowId)}`,
      );
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  if (capabilities && !capabilities.email.passwordRecovery) {
    return (
      <FormMessage>
        Password recovery is not available in this environment.{" "}
        <Link href="/login">Return to sign in.</Link>
      </FormMessage>
    );
  }

  return (
    <>
      <p className="auth-intro">
        We’ll send a recovery code if the address can use password recovery.
      </p>
      <CapabilityState />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <form aria-busy={pending} className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input
            autoComplete="username"
            inputMode="email"
            name="email"
            required
            type="email"
          />
        </label>
        <button
          className="primary-button"
          disabled={pending || !capabilities}
          type="submit"
        >
          {pending ? "Requesting code…" : "Send recovery code"}
        </button>
      </form>
      <p className="auth-switch">
        <Link href="/login">Back to sign in</Link>
      </p>
    </>
  );
}
