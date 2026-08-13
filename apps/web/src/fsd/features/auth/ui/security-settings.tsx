"use client";

import {
  ChangePasswordRequestSchema,
  PasskeyNameSchema,
  type PasskeyListResponse,
  type PasskeyMetadata,
} from "@languon/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { useSessionStore } from "@/fsd/entities/session/model/session-store";
import {
  authApi,
  AuthApiError,
  authErrorMessage,
} from "@/fsd/shared/api/auth-api";

import { createPasskey, supportsPasskeys } from "../lib/webauthn";
import { useAuth } from "../model/auth-provider";
import { FormMessage } from "./auth-shell";
import { PasswordField } from "./password-field";

function readableDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SecuritySettings() {
  const router = useRouter();
  const status = useSessionStore((state) => state.status);
  const user = useSessionStore((state) => state.user);
  const session = useSessionStore((state) => state.session);
  const queryClient = useQueryClient();
  const {
    acceptAuthentication,
    capabilities,
    requestWithSession,
    signOutEverywhere,
    signOutHere,
  } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recentAuthenticationRequired, setRecentAuthenticationRequired] =
    useState(false);
  const [ceremonyPending, setCeremonyPending] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  useEffect(() => setPasskeySupported(supportsPasskeys()), []);

  useEffect(() => {
    if (status === "signed-out") {
      router.replace("/login?returnTo=%2Fsecurity");
    }
  }, [router, status]);

  const passkeyQueryKey = ["auth", "passkeys", user?.id] as const;
  const passkeyQuery = useQuery({
    enabled: status === "authenticated" && Boolean(user),
    queryFn: () => requestWithSession((token) => authApi.listPasskeys(token)),
    queryKey: passkeyQueryKey,
  });
  const passkeys = passkeyQuery.data?.passkeys ?? [];

  function updatePasskeys(
    update: (current: PasskeyMetadata[]) => PasskeyMetadata[],
  ) {
    queryClient.setQueryData<PasskeyListResponse>(
      passkeyQueryKey,
      (current) => ({ passkeys: update(current?.passkeys ?? []) }),
    );
  }

  function captureError(caught: unknown) {
    setRecentAuthenticationRequired(
      caught instanceof AuthApiError &&
        caught.detail.code === "recent_authentication_required",
    );
    setError(authErrorMessage(caught));
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRecentAuthenticationRequired(false);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const parsed = ChangePasswordRequestSchema.safeParse({
      currentPassword: data.get("currentPassword"),
      newPassword: data.get("newPassword"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check both passwords.");
      return;
    }

    setPasswordPending(true);
    try {
      const response = await requestWithSession((token) =>
        authApi.changePassword(parsed.data, token),
      );
      acceptAuthentication(response);
      form.reset();
      setMessage("Password changed. Your other sessions were signed out.");
    } catch (caught) {
      captureError(caught);
    } finally {
      setPasswordPending(false);
    }
  }

  async function registerPasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRecentAuthenticationRequired(false);
    setMessage(null);
    const form = event.currentTarget;
    const name = PasskeyNameSchema.safeParse(new FormData(form).get("name"));
    if (!name.success) {
      setError(name.error.issues[0]?.message ?? "Enter a passkey name.");
      return;
    }

    setCeremonyPending(true);
    try {
      const ceremony = await requestWithSession((token) =>
        authApi.passkeyRegistrationOptions(token),
      );
      const credential = await createPasskey(ceremony.options);
      const response = await requestWithSession((token) =>
        authApi.verifyPasskeyRegistration(
          { credential, flowId: ceremony.flowId, name: name.data },
          token,
        ),
      );
      updatePasskeys((current) => [...current, response.passkey]);
      form.reset();
      setMessage("Passkey added.");
    } catch (caught) {
      captureError(caught);
    } finally {
      setCeremonyPending(false);
    }
  }

  async function renamePasskey(passkeyId: string, name: string) {
    const parsed = PasskeyNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a passkey name.");
      return;
    }
    setError(null);
    setRecentAuthenticationRequired(false);
    try {
      const response = await requestWithSession((token) =>
        authApi.renamePasskey(passkeyId, { name: parsed.data }, token),
      );
      updatePasskeys((current) =>
        current.map((passkey) =>
          passkey.id === passkeyId ? response.passkey : passkey,
        ),
      );
      setMessage("Passkey renamed.");
    } catch (caught) {
      captureError(caught);
    }
  }

  async function revokePasskey(passkeyId: string) {
    if (confirmRevoke !== passkeyId) {
      setConfirmRevoke(passkeyId);
      return;
    }
    setError(null);
    setRecentAuthenticationRequired(false);
    try {
      await requestWithSession((token) =>
        authApi.revokePasskey(passkeyId, token),
      );
      updatePasskeys((current) =>
        current.filter((passkey) => passkey.id !== passkeyId),
      );
      setConfirmRevoke(null);
      setMessage("Passkey removed.");
    } catch (caught) {
      captureError(caught);
    }
  }

  async function logout(scope: "all" | "current") {
    setError(null);
    setLogoutPending(true);
    try {
      if (scope === "all") await signOutEverywhere();
      else await signOutHere();
      router.replace("/login");
    } catch (caught) {
      captureError(caught);
    } finally {
      setLogoutPending(false);
    }
  }

  if (status === "bootstrapping") {
    return (
      <div className="loading-state" role="status">
        Restoring your session…
      </div>
    );
  }

  if (status === "signed-out") {
    return (
      <FormMessage tone="info">
        Sign in to manage your security.{" "}
        <Link href="/login?returnTo=%2Fsecurity">Go to sign in.</Link>
      </FormMessage>
    );
  }

  return (
    <div className="security-stack">
      {error ? (
        <FormMessage>
          {error}
          {recentAuthenticationRequired ? (
            <>
              {" "}
              <Link href="/login?returnTo=%2Fsecurity">Sign in again.</Link>
            </>
          ) : null}
        </FormMessage>
      ) : null}
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}

      <section className="settings-panel" aria-labelledby="account-heading">
        <h2 id="account-heading">Account</h2>
        <dl className="metadata-list">
          <div>
            <dt>Email</dt>
            <dd>{user?.primaryEmail}</dd>
          </div>
          <div>
            <dt>Current session expires</dt>
            <dd>{session ? readableDate(session.expiresAt) : "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="settings-panel" aria-labelledby="password-heading">
        <h2 id="password-heading">Change password</h2>
        <p>Changing your password signs out every other session.</p>
        <form
          aria-busy={passwordPending}
          className="auth-form"
          onSubmit={changePassword}
        >
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="username"
              name="email"
              readOnly
              type="email"
              value={user?.primaryEmail ?? ""}
            />
          </label>
          <PasswordField
            autoComplete="current-password"
            label="Current password"
            name="currentPassword"
          />
          <PasswordField
            autoComplete="new-password"
            label="New password"
            name="newPassword"
          />
          <button
            className="primary-button"
            disabled={passwordPending}
            type="submit"
          >
            {passwordPending ? "Changing password…" : "Change password"}
          </button>
        </form>
      </section>

      {capabilities?.passkeys.registration ? (
        <section className="settings-panel" aria-labelledby="passkeys-heading">
          <h2 id="passkeys-heading">Passkeys</h2>
          <p>
            Use a device passkey for passwordless sign-in. Adding or removing
            one may require a fresh sign-in.
          </p>
          <form className="inline-form" onSubmit={registerPasskey}>
            <label className="field">
              <span>Passkey name</span>
              <input
                autoComplete="off"
                maxLength={160}
                name="name"
                placeholder="Personal laptop"
                required
              />
            </label>
            <button
              className="primary-button"
              disabled={ceremonyPending || !passkeySupported}
              type="submit"
            >
              Add passkey
            </button>
          </form>
          {!passkeySupported ? (
            <small>
              Passkeys need a supported browser in a secure context.
            </small>
          ) : null}
          {passkeyQuery.isPending ? (
            <p role="status">Loading passkeys…</p>
          ) : null}
          {passkeyQuery.isError ? (
            <FormMessage>
              <p>{authErrorMessage(passkeyQuery.error)}</p>
              <button
                className="text-button"
                onClick={() => void passkeyQuery.refetch()}
                type="button"
              >
                Retry loading passkeys
              </button>
            </FormMessage>
          ) : null}
          {passkeyQuery.isSuccess && passkeys.length === 0 ? (
            <p>No passkeys yet.</p>
          ) : null}
          <ul className="passkey-list">
            {passkeys.map((passkey) => (
              <PasskeyRow
                confirmRevoke={confirmRevoke === passkey.id}
                key={passkey.id}
                onCancelRevoke={() => setConfirmRevoke(null)}
                onRename={renamePasskey}
                onRevoke={revokePasskey}
                passkey={passkey}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section
        className="settings-panel settings-panel--danger"
        aria-labelledby="sessions-heading"
      >
        <h2 id="sessions-heading">Sessions</h2>
        <div className="button-row">
          <button
            className="secondary-button"
            disabled={logoutPending}
            onClick={() => void logout("current")}
            type="button"
          >
            Sign out here
          </button>
          <button
            className="danger-button"
            disabled={logoutPending}
            onClick={() => void logout("all")}
            type="button"
          >
            Sign out everywhere
          </button>
        </div>
      </section>
    </div>
  );
}

function PasskeyRow({
  confirmRevoke,
  onCancelRevoke,
  onRename,
  onRevoke,
  passkey,
}: {
  confirmRevoke: boolean;
  onCancelRevoke(): void;
  onRename(passkeyId: string, name: string): Promise<void>;
  onRevoke(passkeyId: string): Promise<void>;
  passkey: PasskeyMetadata;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="passkey-row">
      <div>
        <strong>{passkey.name}</strong>
        <small>
          Added {readableDate(passkey.createdAt)}
          {passkey.lastUsedAt
            ? ` · Last used ${readableDate(passkey.lastUsedAt)}`
            : ""}
        </small>
      </div>
      {editing ? (
        <form
          className="rename-form"
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(
              new FormData(event.currentTarget).get("name") ?? "",
            );
            void onRename(passkey.id, name).then(() => setEditing(false));
          }}
        >
          <label className="sr-only" htmlFor={`passkey-${passkey.id}`}>
            New passkey name
          </label>
          <input
            defaultValue={passkey.name}
            id={`passkey-${passkey.id}`}
            name="name"
            required
          />
          <button
            aria-label={`Save ${passkey.name}`}
            className="text-button"
            type="submit"
          >
            Save
          </button>
          <button
            aria-label={`Cancel renaming ${passkey.name}`}
            className="text-button"
            onClick={() => setEditing(false)}
            type="button"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="button-row">
          <button
            aria-label={`Rename ${passkey.name}`}
            className="text-button"
            onClick={() => setEditing(true)}
            type="button"
          >
            Rename
          </button>
          <button
            aria-label={`${confirmRevoke ? "Confirm remove" : "Remove"} ${passkey.name}`}
            className="text-button text-button--danger"
            onClick={() => void onRevoke(passkey.id)}
            type="button"
          >
            {confirmRevoke ? "Confirm remove" : "Remove"}
          </button>
          {confirmRevoke ? (
            <button
              aria-label={`Cancel removing ${passkey.name}`}
              className="text-button"
              onClick={onCancelRevoke}
              type="button"
            >
              Cancel
            </button>
          ) : null}
        </div>
      )}
    </li>
  );
}
