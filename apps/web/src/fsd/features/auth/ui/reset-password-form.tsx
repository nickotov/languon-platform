"use client";

import { ResetPasswordRequestSchema } from "@languon/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { authApi, authErrorMessage } from "@/fsd/shared/api/auth-api";

import { FormMessage } from "./auth-shell";
import { PasswordField } from "./password-field";
import { useAuth } from "../model/auth-provider";

export function ResetPasswordForm({ flowId }: { flowId?: string | undefined }) {
  const router = useRouter();
  const { clearLocalSession } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const parsed = ResetPasswordRequestSchema.safeParse({
      code: data.get("code"),
      flowId,
      newPassword: data.get("newPassword"),
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Check the code and new password.",
      );
      return;
    }

    setPending(true);
    try {
      await authApi.resetPassword(parsed.data);
      clearLocalSession();
      setComplete(true);
      router.replace("/login?passwordReset=complete");
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  if (complete) {
    return (
      <FormMessage tone="success">
        Your password was changed and existing sessions were signed out.{" "}
        <Link href="/login">Sign in with your new password.</Link>
      </FormMessage>
    );
  }

  return (
    <>
      <p className="auth-intro">
        Enter the four-digit recovery code and choose a new password.
      </p>
      {!flowId ? (
        <FormMessage>
          This recovery link is incomplete.{" "}
          <Link href="/forgot-password">Request a new code.</Link>
        </FormMessage>
      ) : null}
      {error ? <FormMessage>{error}</FormMessage> : null}
      <form aria-busy={pending} className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>Recovery code</span>
          <input
            autoComplete="one-time-code"
            className="code-input"
            inputMode="numeric"
            maxLength={4}
            name="code"
            pattern="[0-9]{4}"
            required
          />
        </label>
        <PasswordField
          autoComplete="new-password"
          label="New password"
          name="newPassword"
        />
        <button
          className="primary-button"
          disabled={pending || !flowId}
          type="submit"
        >
          {pending ? "Changing password…" : "Change password"}
        </button>
      </form>
    </>
  );
}
