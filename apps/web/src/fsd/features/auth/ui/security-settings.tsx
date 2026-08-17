'use client';

import {
    ChangePasswordRequestSchema,
    PasskeyNameSchema,
    type PasskeyListResponse,
    type PasskeyMetadata,
} from '@languon/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

import { useSessionStore } from '@/fsd/entities/session/model/session-store';
import { authApi, AuthApiError } from '@/fsd/shared/api/auth-api';
import { useI18n, useLocaleSensitiveState } from '@/fsd/shared/i18n';
import { Button, Card, Field, Input, LoadingState } from '@/fsd/shared/ui';

import { localizedAuthError } from '../lib/auth-error-message';
import { createPasskey, supportsPasskeys } from '../lib/webauthn';
import { useAuth } from '../model/auth-provider';
import { FormMessage } from './auth-shell';
import { PasswordField } from './password-field';
import styles from './auth-ui.module.css';

export function SecuritySettings() {
    const { formatDate, href, t } = useI18n();
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
    const [error, setError] = useLocaleSensitiveState<string | null>(null);
    const [message, setMessage] = useLocaleSensitiveState<string | null>(null);
    const [recentAuthenticationRequired, setRecentAuthenticationRequired] =
        useState(false);
    const [ceremonyPending, setCeremonyPending] = useState(false);
    const [passwordPending, setPasswordPending] = useState(false);
    const [logoutPending, setLogoutPending] = useState(false);
    const [passkeySupported, setPasskeySupported] = useState(false);
    const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

    useEffect(() => setPasskeySupported(supportsPasskeys()), []);

    useEffect(() => {
        if (status === 'signed-out') {
            router.replace(href('/login?returnTo=%2Fsecurity'));
        }
    }, [href, router, status]);

    const passkeyQueryKey = ['auth', 'passkeys', user?.id] as const;
    const passkeyQuery = useQuery({
        enabled: status === 'authenticated' && Boolean(user),
        queryFn: () =>
            requestWithSession((token) => authApi.listPasskeys(token)),
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
                caught.detail.code === 'recent_authentication_required',
        );
        setError(localizedAuthError(caught, t));
    }

    async function changePassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setRecentAuthenticationRequired(false);
        setMessage(null);
        const form = event.currentTarget;
        const data = new FormData(form);
        const parsed = ChangePasswordRequestSchema.safeParse({
            currentPassword: data.get('currentPassword'),
            newPassword: data.get('newPassword'),
        });
        if (!parsed.success) {
            setError(t('security.passwordsInvalid'));
            return;
        }

        setPasswordPending(true);
        try {
            const response = await requestWithSession((token) =>
                authApi.changePassword(parsed.data, token),
            );
            acceptAuthentication(response);
            form.reset();
            setMessage(t('security.passwordChanged'));
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
        const name = PasskeyNameSchema.safeParse(
            new FormData(form).get('name'),
        );
        if (!name.success) {
            setError(t('security.passkeyNameInvalid'));
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
            setMessage(t('security.passkeyAdded'));
        } catch (caught) {
            captureError(caught);
        } finally {
            setCeremonyPending(false);
        }
    }

    async function renamePasskey(passkeyId: string, name: string) {
        const parsed = PasskeyNameSchema.safeParse(name);
        if (!parsed.success) {
            setError(t('security.passkeyNameInvalid'));
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
            setMessage(t('security.passkeyRenamed'));
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
            setMessage(t('security.passkeyRemoved'));
        } catch (caught) {
            captureError(caught);
        }
    }

    async function logout(scope: 'all' | 'current') {
        setError(null);
        setLogoutPending(true);
        try {
            if (scope === 'all') await signOutEverywhere();
            else await signOutHere();
            router.replace(href('/login'));
        } catch (caught) {
            captureError(caught);
        } finally {
            setLogoutPending(false);
        }
    }

    if (status === 'bootstrapping') {
        return <LoadingState>{t('security.restoring')}</LoadingState>;
    }

    if (status === 'signed-out') {
        return (
            <FormMessage tone='info'>
                {t('security.signInRequired')}{' '}
                <Link href={href('/login?returnTo=%2Fsecurity')}>
                    {t('security.goToSignIn')}
                </Link>
            </FormMessage>
        );
    }

    return (
        <div className={styles.stack}>
            {error ? (
                <FormMessage>
                    {error}
                    {recentAuthenticationRequired ? (
                        <>
                            {' '}
                            <Link href={href('/login?returnTo=%2Fsecurity')}>
                                {t('security.signInAgain')}
                            </Link>
                        </>
                    ) : null}
                </FormMessage>
            ) : null}
            {message ? (
                <FormMessage tone='success'>{message}</FormMessage>
            ) : null}

            <Card className={styles.panel} aria-labelledby='account-heading'>
                <h2 id='account-heading'>{t('security.account')}</h2>
                <dl className={styles.metadata}>
                    <div>
                        <dt>{t('common.email')}</dt>
                        <dd>{user?.primaryEmail}</dd>
                    </div>
                    <div>
                        <dt>{t('security.sessionExpires')}</dt>
                        <dd>{session ? formatDate(session.expiresAt) : '—'}</dd>
                    </div>
                </dl>
            </Card>

            <Card className={styles.panel} aria-labelledby='password-heading'>
                <h2 id='password-heading'>{t('security.changePassword')}</h2>
                <p>{t('security.changePasswordHelp')}</p>
                <form
                    aria-busy={passwordPending}
                    className={styles.form}
                    onSubmit={changePassword}
                >
                    <Field label={t('common.email')}>
                        <Input
                            autoComplete='username'
                            name='email'
                            readOnly
                            type='email'
                            value={user?.primaryEmail ?? ''}
                        />
                    </Field>
                    <PasswordField
                        autoComplete='current-password'
                        label={t('common.currentPassword')}
                        name='currentPassword'
                    />
                    <PasswordField
                        autoComplete='new-password'
                        label={t('common.newPassword')}
                        name='newPassword'
                    />
                    <Button disabled={passwordPending} type='submit'>
                        {passwordPending
                            ? t('reset.pending')
                            : t('security.changePassword')}
                    </Button>
                </form>
            </Card>

            {capabilities?.passkeys.registration ? (
                <Card
                    className={styles.panel}
                    aria-labelledby='passkeys-heading'
                >
                    <h2 id='passkeys-heading'>{t('security.passkeys')}</h2>
                    <p>{t('security.passkeysHelp')}</p>
                    <form className={styles.row} onSubmit={registerPasskey}>
                        <Field label={t('security.passkeyName')} required>
                            <Input
                                autoComplete='off'
                                maxLength={160}
                                name='name'
                                placeholder={t('security.passkeyPlaceholder')}
                                required
                            />
                        </Field>
                        <Button
                            disabled={ceremonyPending || !passkeySupported}
                            type='submit'
                        >
                            {t('security.addPasskey')}
                        </Button>
                    </form>
                    {!passkeySupported ? (
                        <small>{t('passkey.unsupported')}</small>
                    ) : null}
                    {passkeyQuery.isPending ? (
                        <p role='status'>{t('security.loadingPasskeys')}</p>
                    ) : null}
                    {passkeyQuery.isError ? (
                        <FormMessage>
                            <p>{localizedAuthError(passkeyQuery.error, t)}</p>
                            <Button
                                onClick={() => void passkeyQuery.refetch()}
                                type='button'
                                variant='quiet'
                            >
                                {t('security.retryPasskeys')}
                            </Button>
                        </FormMessage>
                    ) : null}
                    {passkeyQuery.isSuccess && passkeys.length === 0 ? (
                        <p>{t('security.noPasskeys')}</p>
                    ) : null}
                    <ul className={styles.list}>
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
                </Card>
            ) : null}

            <Card className={styles.panel} aria-labelledby='sessions-heading'>
                <h2 id='sessions-heading'>{t('security.sessions')}</h2>
                <div className={styles.actions}>
                    <Button
                        disabled={logoutPending}
                        onClick={() => void logout('current')}
                        type='button'
                        variant='secondary'
                    >
                        {t('security.signOutHere')}
                    </Button>
                    <Button
                        disabled={logoutPending}
                        onClick={() => void logout('all')}
                        type='button'
                        variant='danger'
                    >
                        {t('security.signOutEverywhere')}
                    </Button>
                </div>
            </Card>
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
    const { formatDate, t } = useI18n();
    const [editing, setEditing] = useState(false);
    return (
        <li className={styles.listItem}>
            <div>
                <strong>{passkey.name}</strong>
                <small>
                    {t('security.added', {
                        date: formatDate(passkey.createdAt),
                    })}
                    {passkey.lastUsedAt
                        ? ` · ${t('security.lastUsed', {
                              date: formatDate(passkey.lastUsedAt),
                          })}`
                        : ''}
                </small>
            </div>
            {editing ? (
                <form
                    className={styles.row}
                    onSubmit={(event) => {
                        event.preventDefault();
                        const name = String(
                            new FormData(event.currentTarget).get('name') ?? '',
                        );
                        void onRename(passkey.id, name).then(() =>
                            setEditing(false),
                        );
                    }}
                >
                    <label
                        className={styles.srOnly}
                        htmlFor={`passkey-${passkey.id}`}
                    >
                        {t('security.newPasskeyName')}
                    </label>
                    <Input
                        defaultValue={passkey.name}
                        id={`passkey-${passkey.id}`}
                        name='name'
                        required
                    />
                    <Button
                        aria-label={t('security.saveNamed', {
                            name: passkey.name,
                        })}
                        type='submit'
                        variant='quiet'
                    >
                        {t('common.save')}
                    </Button>
                    <Button
                        aria-label={t('security.cancelRenaming', {
                            name: passkey.name,
                        })}
                        onClick={() => setEditing(false)}
                        type='button'
                        variant='quiet'
                    >
                        {t('common.cancel')}
                    </Button>
                </form>
            ) : (
                <div className={styles.actions}>
                    <Button
                        aria-label={t('security.renameNamed', {
                            name: passkey.name,
                        })}
                        onClick={() => setEditing(true)}
                        type='button'
                        variant='quiet'
                    >
                        {t('security.rename')}
                    </Button>
                    <Button
                        aria-label={t(
                            confirmRevoke
                                ? 'security.confirmRemoveNamed'
                                : 'security.removeNamed',
                            { name: passkey.name },
                        )}
                        onClick={() => void onRevoke(passkey.id)}
                        type='button'
                        variant='danger'
                    >
                        {confirmRevoke
                            ? t('security.confirmRemove')
                            : t('security.remove')}
                    </Button>
                    {confirmRevoke ? (
                        <Button
                            aria-label={t('security.cancelRemoving', {
                                name: passkey.name,
                            })}
                            onClick={onCancelRevoke}
                            type='button'
                            variant='quiet'
                        >
                            {t('common.cancel')}
                        </Button>
                    ) : null}
                </div>
            )}
        </li>
    );
}
