"use client";

import { PasswordLoginRequestSchema } from "@languon/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { authApi, authErrorMessage } from "@/fsd/shared/api/auth-api";
import { safeReturnPath } from "@/fsd/shared/lib/return-path";
import { useSessionStore } from "@/fsd/entities/session/model/session-store";

import { getPasskey, supportsPasskeys } from "../lib/webauthn";
import { useAuth } from "../model/auth-provider";
import { AuthLinks, FormMessage } from "./auth-shell";
import { CapabilityState } from "./capability-state";
import { PasswordField } from "./password-field";

export function LoginForm({
  passwordReset,
  returnTo,
}: {
  passwordReset?: string | undefined;
  returnTo?: string | undefined;
}) {
  const router = useRouter();
  const { authenticate, capabilities } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"passkey" | "password" | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const sessionStatus = useSessionStore((state) => state.status);
  const destination = safeReturnPath(returnTo);

  useEffect(() => setPasskeySupported(supportsPasskeys()), []);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sessionStatus === "bootstrapping") return;
    setError(null);
    const data = new FormData(event.currentTarget);
    const parsed = PasswordLoginRequestSchema.safeParse({
      email: data.get("email"),
      password: data.get("password"),
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Check your sign-in details.",
      );
      return;
    }

    setPending("password");
    try {
      const response = await authenticate(
        () => authApi.passwordLogin(parsed.data),
        (result) => (result.status === "authenticated" ? result : undefined),
      );
      if (response.status === "email_verification_required") {
        const query = new URLSearchParams({
          flowId: response.verification.flowId,
          resendAvailableAt: response.verification.resendAvailableAt,
          returnTo: destination,
        });
        router.push(`/verify-email?${query.toString()}`);
        return;
      }
      router.replace(destination);
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setPending(null);
    }
  }

  async function submitPasskey() {
    if (sessionStatus === "bootstrapping") return;
    setError(null);
    setPending("passkey");
    try {
      await authenticate(
        async () => {
          const ceremony = await authApi.passkeyAuthenticationOptions();
          const credential = await getPasskey(ceremony.options);
          return authApi.verifyPasskeyAuthentication({
            credential,
            flowId: ceremony.flowId,
          });
        },
        (result) => result,
      );
      router.replace(destination);
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <p className="auth-intro">
        Welcome back. Your learning space is ready when you are.
      </p>
      {passwordReset === "complete" ? (
        <FormMessage tone="success">
          Your password was changed and existing sessions were signed out. Sign
          in with your new password.
        </FormMessage>
      ) : null}
      <CapabilityState />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <form
        aria-busy={pending === "password"}
        className="auth-form"
        onSubmit={submitPassword}
      >
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
        <PasswordField
          autoComplete="current-password"
          label="Password"
          name="password"
        />
        {capabilities?.email.passwordRecovery ? (
          <div className="field-row">
            <Link href="/forgot-password">Forgot password?</Link>
          </div>
        ) : null}
        <button
          className="primary-button"
          disabled={
            pending !== null ||
            sessionStatus === "bootstrapping" ||
            capabilities?.passwordAuthentication === false
          }
          type="submit"
        >
          {pending === "password" ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {capabilities?.passkeys.authentication ? (
        <div className="alternative-action">
          <span>or</span>
          <button
            className="secondary-button"
            disabled={
              pending !== null ||
              sessionStatus === "bootstrapping" ||
              !passkeySupported
            }
            onClick={() => void submitPasskey()}
            type="button"
          >
            {pending === "passkey"
              ? "Waiting for passkey…"
              : "Sign in with a passkey"}
          </button>
          {!passkeySupported ? (
            <small>
              Passkeys need a supported browser in a secure context.
            </small>
          ) : null}
        </div>
      ) : null}
      <AuthLinks
        mode="login"
        signupAvailable={capabilities?.email.signUp ?? false}
      />
    </>
  );
}
