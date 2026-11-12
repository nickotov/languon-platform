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
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';

import { useSessionStore } from '@/fsd/entities/session';
import { authApi, AuthApiError } from '@/fsd/shared/api/auth-api';
import { useI18n, useLocaleSensitiveState } from '@/fsd/shared/i18n';
import { Card, LoadingState } from '@/fsd/shared/ui';

import { localizedAuthError } from '../../lib/auth-error-message';
import { createPasskey, supportsPasskeys } from '../../lib/webauthn';
import { useAuth } from '../../model/auth-provider';
import { FormMessage } from '../auth-shell';
import styles from '../styles/auth-ui-common.module.css';
import profileStyles from '../styles/security-settings-common.module.css';
import { PasskeyRevokeDialog } from '../passkey-revoke-dialog/passkey-revoke-dialog';
import { PasskeyRenameDialog } from '../passkey-rename-dialog/passkey-rename-dialog';
import { SecurityPasskeysPanel } from '../security-passkeys-panel/security-passkeys-panel';
import { SecuritySessionsPanel } from '../security-sessions-panel/security-sessions-panel';

import { SecurityProviderMethods } from '../security-provider-methods/security-provider-methods';

import { SecurityPasswordPanel } from '../security-password-panel/security-password-panel';

export function SecuritySettings({
    embedded = false,
}: { embedded?: boolean } = {}) {
    const { formatDate, href, t } = useI18n();

    const router = useRouter();

    const status = useSessionStore((state) => state.status);

    const user = useSessionStore((state) => state.user);

    const session = useSessionStore((state) => state.session);

    const queryClient = useQueryClient();

    const {
        acceptAuthentication,
        capabilities,
        capabilitiesError,
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

    const [passkeyError, setPasskeyError] = useLocaleSensitiveState<
        string | null
    >(null);

    const [passkeyRecentAuthAction, setPasskeyRecentAuthAction] = useState<
        'add' | 'rename' | 'revoke' | null
    >(null);

    const [renameTarget, setRenameTarget] = useState<PasskeyMetadata | null>(
        null,
    );

    const [renameDraft, setRenameDraft] = useState('');

    const [renamePending, setRenamePending] = useState(false);

    const [renameError, setRenameError] = useLocaleSensitiveState<
        string | null
    >(null);

    const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

    const [revokePending, setRevokePending] = useState(false);

    const [revokeError, setRevokeError] = useLocaleSensitiveState<
        string | null
    >(null);

    useEffect(() => setPasskeySupported(supportsPasskeys()), []);

    useEffect(() => {
        if (status === 'signed-out') {
            router.replace(href('/login?returnTo=%2Fprofile%3Ftab%3Dsecurity'));
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

    async function registerPasskey() {
        if (
            ceremonyPending ||
            !passkeySupported ||
            !capabilities?.passkeys.registration ||
            !passkeyQuery.isSuccess
        ) {
            return;
        }

        setPasskeyError(null);

        setPasskeyRecentAuthAction(null);

        setMessage(null);

        // The registration contract requires a name. Never guess the device type;
        // assign an available generic name and let the owner rename it later.
        const existingNames = new Set(
            passkeys.map((passkey) => passkey.name.toLocaleLowerCase()),
        );

        let index = 1;

        while (
            existingNames.has(
                t('security.defaultPasskeyName', {
                    number: index,
                }).toLocaleLowerCase(),
            )
        ) {
            index += 1;
        }

        const name = t('security.defaultPasskeyName', { number: index });

        setCeremonyPending(true);

        try {
            const ceremony = await requestWithSession((token) =>
                authApi.passkeyRegistrationOptions(token),
            );

            const credential = await createPasskey(ceremony.options);

            const response = await requestWithSession((token) =>
                authApi.verifyPasskeyRegistration(
                    { credential, flowId: ceremony.flowId, name },
                    token,
                ),
            );

            updatePasskeys((current) => [...current, response.passkey]);

            setMessage(t('security.passkeyAdded'));
        } catch (caught) {
            setPasskeyError(localizedAuthError(caught, t));

            if (
                caught instanceof AuthApiError &&
                caught.detail.code === 'recent_authentication_required'
            ) {
                setPasskeyRecentAuthAction('add');
            }
        } finally {
            setCeremonyPending(false);
        }
    }

    async function renamePasskey(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!renameTarget || renamePending) {
            return;
        }

        const parsed = PasskeyNameSchema.safeParse(renameDraft);

        if (!parsed.success) {
            setRenameError(t('security.passkeyNameInvalid'));

            return;
        }

        setRenameError(null);

        setPasskeyRecentAuthAction(null);

        setRenamePending(true);

        try {
            const response = await requestWithSession((token) =>
                authApi.renamePasskey(
                    renameTarget.id,
                    { name: parsed.data },
                    token,
                ),
            );

            updatePasskeys((current) =>
                current.map((passkey) =>
                    passkey.id === renameTarget.id ? response.passkey : passkey,
                ),
            );

            setRenameTarget(null);

            setMessage(t('security.passkeyRenamed'));
        } catch (caught) {
            setRenameError(localizedAuthError(caught, t));

            if (
                caught instanceof AuthApiError &&
                caught.detail.code === 'recent_authentication_required'
            ) {
                setPasskeyRecentAuthAction('rename');
            }
        } finally {
            setRenamePending(false);
        }
    }

    async function revokePasskey(passkeyId: string) {
        setError(null);

        setRecentAuthenticationRequired(false);

        setRevokeError(null);

        setPasskeyRecentAuthAction(null);

        setRevokePending(true);

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
            setRevokeError(localizedAuthError(caught, t));

            if (
                caught instanceof AuthApiError &&
                caught.detail.code === 'recent_authentication_required'
            ) {
                setPasskeyRecentAuthAction('revoke');
            }
        } finally {
            setRevokePending(false);
        }
    }

    async function logout(scope: 'all' | 'current') {
        setError(null);

        setLogoutPending(true);

        try {
            if (scope === 'all') {
                await signOutEverywhere();
            } else {
                await signOutHere();
            }

            router.replace(href('/login'));
        } catch (caught) {
            captureError(caught);
        } finally {
            setLogoutPending(false);
        }
    }

    function dismissPasskeyError() {
        setPasskeyError(null);
    }

    function beginRename(passkey: PasskeyMetadata) {
        setRenameTarget(passkey);
        setRenameDraft(passkey.name);
        setRenameError(null);
    }

    function beginRevoke(passkeyId: string) {
        setRevokeError(null);
        setConfirmRevoke(passkeyId);
    }

    function cancelRename() {
        setRenameTarget(null);
        setRenameError(null);
    }

    function closeRename() {
        if (!renamePending) {
            cancelRename();
        }
    }

    function changeRenameDraft(event: ChangeEvent<HTMLInputElement>) {
        setRenameDraft(event.target.value);
    }

    function cancelRevoke() {
        setConfirmRevoke(null);
        setRevokeError(null);
    }

    function closeRevoke() {
        if (!revokePending) {
            cancelRevoke();
        }
    }

    function confirmPasskeyRevocation() {
        if (confirmRevoke) {
            void revokePasskey(confirmRevoke);
        }
    }

    function logoutCurrentSession() {
        void logout('current');
    }

    function logoutAllSessions() {
        void logout('all');
    }

    const registrationView = {
        supported: passkeySupported,
        pending: ceremonyPending,
        error: passkeyError,
        requiresRecentAuthentication: passkeyRecentAuthAction === 'add',
        start: registerPasskey,
        dismissError: dismissPasskeyError,
    };

    if (status === 'bootstrapping') {
        return <LoadingState>{t('security.restoring')}</LoadingState>;
    }

    if (status === 'signed-out') {
        return (
            <FormMessage tone='info'>
                {t('security.signInRequired')}{' '}
                <Link
                    href={href('/login?returnTo=%2Fprofile%3Ftab%3Dsecurity')}
                >
                    {t('security.goToSignIn')}
                </Link>
            </FormMessage>
        );
    }

    return (
        <div className={embedded ? profileStyles.stack : styles.stack}>
            {error ? (
                <FormMessage>
                    {error}
                    {recentAuthenticationRequired ? (
                        <>
                            {' '}
                            <Link
                                href={href(
                                    '/login?returnTo=%2Fprofile%3Ftab%3Dsecurity',
                                )}
                            >
                                {t('security.signInAgain')}
                            </Link>
                        </>
                    ) : null}
                </FormMessage>
            ) : null}
            {message ? (
                <FormMessage tone='success'>{message}</FormMessage>
            ) : null}

            {!embedded ? (
                <Card
                    className={styles.panel}
                    aria-labelledby='account-heading'
                >
                    <h2 id='account-heading'>{t('security.account')}</h2>
                    <dl className={styles.metadata}>
                        <div>
                            <dt>{t('common.email')}</dt>
                            <dd>{user?.primaryEmail}</dd>
                        </div>
                        <div>
                            <dt>{t('security.sessionExpires')}</dt>
                            <dd>
                                {session ? formatDate(session.expiresAt) : '—'}
                            </dd>
                        </div>
                    </dl>
                </Card>
            ) : null}

            <SecurityPasswordPanel
                embedded={embedded}
                email={user?.primaryEmail ?? ''}
                pending={passwordPending}
                onSubmit={changePassword}
            />

            {embedded ? (
                <SecurityProviderMethods email={user?.primaryEmail} />
            ) : null}

            <SecurityPasskeysPanel
                embedded={embedded}
                capabilities={capabilities}
                capabilitiesError={capabilitiesError}
                passkeyQuery={passkeyQuery}
                passkeys={passkeys}
                registration={registrationView}
                onRename={beginRename}
                onRevoke={beginRevoke}
            />

            <PasskeyRenameDialog
                open={Boolean(renameTarget)}
                pending={renamePending}
                draft={renameDraft}
                error={renameError}
                requiresRecentAuthentication={
                    passkeyRecentAuthAction === 'rename'
                }
                onCancel={cancelRename}
                onClose={closeRename}
                onDraftChange={changeRenameDraft}
                onSubmit={renamePasskey}
            />

            <PasskeyRevokeDialog
                open={Boolean(confirmRevoke)}
                pending={revokePending}
                passkeyName={
                    passkeys.find((passkey) => passkey.id === confirmRevoke)
                        ?.name
                }
                error={revokeError}
                requiresRecentAuthentication={
                    passkeyRecentAuthAction === 'revoke'
                }
                onCancel={cancelRevoke}
                onClose={closeRevoke}
                onConfirm={confirmPasskeyRevocation}
            />

            <SecuritySessionsPanel
                embedded={embedded}
                expiresAt={session?.expiresAt}
                pending={logoutPending}
                onSignOutHere={logoutCurrentSession}
                onSignOutEverywhere={logoutAllSessions}
            />
        </div>
    );
}
