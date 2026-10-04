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
import {
    AtSign,
    Fingerprint,
    Globe2,
    Pencil,
    Plus,
    Trash2,
} from 'lucide-react';

import { useSessionStore } from '@/fsd/entities/session';
import { authApi, AuthApiError } from '@/fsd/shared/api/auth-api';
import { useI18n, useLocaleSensitiveState } from '@/fsd/shared/i18n';
import {
    Badge,
    Button,
    Card,
    Dialog,
    DialogActions,
    Field,
    IconButton,
    InlineAlert,
    Input,
    LoadingState,
} from '@/fsd/shared/ui';

import { localizedAuthError } from '../lib/auth-error-message';
import { createPasskey, supportsPasskeys } from '../lib/webauthn';
import { useAuth } from '../model/auth-provider';
import { FormMessage } from './auth-shell';
import { PasswordField } from './password-field';
import styles from './auth-ui.module.css';
import profileStyles from './security-settings.module.css';

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
        )
            return;

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
        )
            index += 1;

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
            )
                setPasskeyRecentAuthAction('add');
        } finally {
            setCeremonyPending(false);
        }
    }

    async function renamePasskey(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!renameTarget || renamePending) return;

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
            )
                setPasskeyRecentAuthAction('rename');
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
            )
                setPasskeyRecentAuthAction('revoke');
        } finally {
            setRevokePending(false);
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

            <Card
                aria-labelledby='password-heading'
                className={embedded ? profileStyles.panel : styles.panel}
                padding={embedded ? 'none' : 'md'}
                variant={embedded ? 'outlined' : 'elevated'}
            >
                <div
                    className={
                        embedded
                            ? `${profileStyles.panelHeader} ${profileStyles.panelSection}`
                            : undefined
                    }
                >
                    <h2
                        className={
                            embedded ? profileStyles.panelHeading : undefined
                        }
                        id='password-heading'
                    >
                        {t('security.changePassword')}
                    </h2>
                    <p
                        className={
                            embedded
                                ? profileStyles.panelDescription
                                : undefined
                        }
                    >
                        {t('security.changePasswordHelp')}
                    </p>
                </div>
                <div
                    className={
                        embedded
                            ? `${profileStyles.panelBody} ${profileStyles.panelSection}`
                            : undefined
                    }
                >
                    <form
                        aria-busy={passwordPending}
                        className={
                            embedded
                                ? `${styles.form} ${profileStyles.panelForm}`
                                : styles.form
                        }
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
                        <Button
                            className={styles.formButton}
                            disabled={passwordPending}
                            type='submit'
                        >
                            {passwordPending
                                ? t('reset.pending')
                                : t('security.changePassword')}
                        </Button>
                    </form>
                </div>
            </Card>

            {embedded ? (
                <Card
                    aria-labelledby='methods-heading'
                    className={profileStyles.panel}
                    padding='none'
                    variant='outlined'
                >
                    <div
                        className={`${profileStyles.panelHeader} ${profileStyles.panelSection}`}
                    >
                        <h2
                            className={profileStyles.panelHeading}
                            id='methods-heading'
                        >
                            {t('profile.methodsTitle')}
                        </h2>
                        <p className={profileStyles.panelDescription}>
                            {t('profile.methodsDescription')}
                        </p>
                    </div>
                    <div
                        className={`${profileStyles.panelBody} ${profileStyles.panelSection}`}
                    >
                        <div className={profileStyles.rowList}>
                            <div className={profileStyles.dataRow}>
                                <span
                                    aria-hidden='true'
                                    className={profileStyles.rowIcon}
                                >
                                    <AtSign size={18} />
                                </span>
                                <div className={profileStyles.rowCopy}>
                                    <h3 className={profileStyles.rowTitle}>
                                        {t('profile.emailMethod')}
                                    </h3>
                                    <p className={profileStyles.rowDescription}>
                                        {user?.primaryEmail}
                                    </p>
                                </div>
                                <Badge size='sm' tone='success'>
                                    {t('profile.available')}
                                </Badge>
                            </div>
                            {(['Google', 'Yandex', 'Apple'] as const).map(
                                (provider) => (
                                    <div
                                        className={profileStyles.dataRow}
                                        key={provider}
                                    >
                                        <span
                                            aria-hidden='true'
                                            className={profileStyles.rowIcon}
                                        >
                                            <Globe2 size={18} />
                                        </span>
                                        <div className={profileStyles.rowCopy}>
                                            <h3
                                                className={
                                                    profileStyles.rowTitle
                                                }
                                            >
                                                {provider}{' '}
                                                <Badge size='sm' tone='neutral'>
                                                    {t('profile.comingSoon')}
                                                </Badge>
                                            </h3>
                                            <p
                                                className={
                                                    profileStyles.rowDescription
                                                }
                                            >
                                                {t(
                                                    'profile.providerComingSoon',
                                                )}
                                            </p>
                                        </div>
                                        <Button
                                            className={profileStyles.rowButton}
                                            disabled
                                            size='compact'
                                            type='button'
                                            variant='secondary'
                                        >
                                            {t('profile.connectProvider')}
                                        </Button>
                                    </div>
                                ),
                            )}
                        </div>
                    </div>
                </Card>
            ) : null}

            <Card
                aria-labelledby='passkeys-heading'
                className={embedded ? profileStyles.panel : styles.panel}
                padding={embedded ? 'none' : 'md'}
                variant={embedded ? 'outlined' : 'elevated'}
            >
                <div
                    className={
                        embedded
                            ? `${profileStyles.panelHeader} ${profileStyles.panelSection}`
                            : undefined
                    }
                >
                    <div
                        className={
                            embedded ? profileStyles.headerLine : undefined
                        }
                    >
                        <div
                            className={
                                embedded ? profileStyles.headerCopy : undefined
                            }
                        >
                            <h2
                                className={
                                    embedded
                                        ? profileStyles.panelHeading
                                        : undefined
                                }
                                id='passkeys-heading'
                            >
                                {t('security.passkeys')}
                            </h2>
                            <p
                                className={
                                    embedded
                                        ? profileStyles.panelDescription
                                        : undefined
                                }
                            >
                                {t('security.passkeysHelp')}
                            </p>
                        </div>
                        <Button
                            disabled={
                                !passkeySupported ||
                                !capabilities?.passkeys.registration ||
                                !passkeyQuery.isSuccess
                            }
                            leadingIcon={<Plus size={16} />}
                            loading={ceremonyPending}
                            onClick={() => void registerPasskey()}
                            size='compact'
                            type='button'
                            variant='secondary'
                        >
                            {t('security.addPasskey')}
                        </Button>
                    </div>
                </div>
                <div
                    className={
                        embedded
                            ? `${profileStyles.panelBody} ${profileStyles.panelSection}`
                            : undefined
                    }
                >
                    {ceremonyPending ? (
                        <InlineAlert
                            title={t('security.waitingForDevice')}
                            tone='info'
                        >
                            {t('security.confirmDevicePrompt')}
                        </InlineAlert>
                    ) : null}
                    {passkeyError ? (
                        <InlineAlert
                            onDismiss={() => setPasskeyError(null)}
                            title={t('security.passkeyActionFailed')}
                            tone='error'
                        >
                            {passkeyError}
                            {passkeyRecentAuthAction === 'add' ? (
                                <p>
                                    <Link
                                        href={href(
                                            '/login?returnTo=%2Fprofile%3Ftab%3Dsecurity',
                                        )}
                                    >
                                        {t('security.signInAgain')}
                                    </Link>
                                </p>
                            ) : null}
                        </InlineAlert>
                    ) : null}
                    {!passkeySupported ? (
                        <small>{t('passkey.unsupported')}</small>
                    ) : null}
                    {capabilities === null && !capabilitiesError ? (
                        <small role='status'>
                            {t('security.loadingCapabilities')}
                        </small>
                    ) : null}
                    {capabilitiesError ? (
                        <InlineAlert tone='error'>
                            {capabilitiesError}
                        </InlineAlert>
                    ) : null}
                    {capabilities && !capabilities.passkeys.registration ? (
                        <small>{t('security.passkeyUnavailable')}</small>
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
                        <div className={profileStyles.emptyState}>
                            <span
                                aria-hidden='true'
                                className={profileStyles.emptyIcon}
                            >
                                <Fingerprint size={24} />
                            </span>
                            <h3 className={profileStyles.emptyTitle}>
                                {t('security.noPasskeys')}
                            </h3>
                            <p className={profileStyles.emptyDescription}>
                                {t('security.passkeyEmptyHelp')}
                            </p>
                            <Button
                                className={profileStyles.emptyAction}
                                disabled={
                                    !passkeySupported ||
                                    !capabilities?.passkeys.registration
                                }
                                loading={ceremonyPending}
                                onClick={() => void registerPasskey()}
                                size='compact'
                                type='button'
                            >
                                {t('security.addFirstPasskey')}
                            </Button>
                        </div>
                    ) : null}
                    <ul
                        className={
                            embedded ? profileStyles.passkeyList : styles.list
                        }
                    >
                        {passkeys.map((passkey) => (
                            <PasskeyRow
                                embedded={embedded}
                                key={passkey.id}
                                onRename={() => {
                                    setRenameTarget(passkey);

                                    setRenameDraft(passkey.name);

                                    setRenameError(null);
                                }}
                                onRevoke={() => {
                                    setRevokeError(null);

                                    setConfirmRevoke(passkey.id);
                                }}
                                passkey={passkey}
                            />
                        ))}
                    </ul>
                </div>
            </Card>

            <Dialog
                closeLabel={t('profile.dismiss')}
                dismissible={!renamePending}
                footer={
                    <DialogActions>
                        <Button
                            disabled={renamePending}
                            onClick={() => {
                                setRenameTarget(null);

                                setRenameError(null);
                            }}
                            type='button'
                            variant='quiet'
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            disabled={renamePending || !renameTarget}
                            form='rename-passkey-form'
                            loading={renamePending}
                            type='submit'
                        >
                            {t('common.save')}
                        </Button>
                    </DialogActions>
                }
                onClose={() => {
                    if (!renamePending) {
                        setRenameTarget(null);

                        setRenameError(null);
                    }
                }}
                open={Boolean(renameTarget)}
                size='sm'
                title={t('security.renamePasskeyTitle')}
            >
                <form id='rename-passkey-form' onSubmit={renamePasskey}>
                    <Field label={t('security.newPasskeyName')} required>
                        <Input
                            autoComplete='off'
                            autoFocus
                            maxLength={160}
                            onChange={(event) =>
                                setRenameDraft(event.target.value)
                            }
                            required
                            value={renameDraft}
                        />
                    </Field>
                    {renameError ? (
                        <InlineAlert tone='error'>{renameError}</InlineAlert>
                    ) : null}
                    {passkeyRecentAuthAction === 'rename' ? (
                        <p>
                            <Link
                                href={href(
                                    '/login?returnTo=%2Fprofile%3Ftab%3Dsecurity',
                                )}
                            >
                                {t('security.signInAgain')}
                            </Link>
                        </p>
                    ) : null}
                </form>
            </Dialog>

            <Dialog
                closeLabel={t('profile.dismiss')}
                dismissible={!revokePending}
                footer={
                    <DialogActions>
                        <Button
                            disabled={revokePending}
                            onClick={() => {
                                setConfirmRevoke(null);

                                setRevokeError(null);
                            }}
                            type='button'
                            variant='quiet'
                        >
                            {t('security.keepPasskey')}
                        </Button>
                        <Button
                            disabled={revokePending || !confirmRevoke}
                            onClick={() => {
                                if (confirmRevoke)
                                    void revokePasskey(confirmRevoke);
                            }}
                            type='button'
                            variant='danger'
                        >
                            {t(
                                revokePending
                                    ? 'security.revokingPasskey'
                                    : 'security.revokePasskey',
                            )}
                        </Button>
                    </DialogActions>
                }
                onClose={() => {
                    if (!revokePending) {
                        setConfirmRevoke(null);

                        setRevokeError(null);
                    }
                }}
                open={Boolean(confirmRevoke)}
                role='alertdialog'
                showCloseButton={!revokePending}
                size='sm'
                title={t('security.revokePasskeyTitle')}
            >
                <p>
                    {t('security.revokePasskeyDescription', {
                        name:
                            passkeys.find(
                                (passkey) => passkey.id === confirmRevoke,
                            )?.name ?? t('security.passkeys'),
                    })}
                </p>
                <p>{t('security.revokePasskeyFallback')}</p>
                {revokeError ? (
                    <InlineAlert tone='error'>{revokeError}</InlineAlert>
                ) : null}
                {passkeyRecentAuthAction === 'revoke' ? (
                    <p>
                        <Link
                            href={href(
                                '/login?returnTo=%2Fprofile%3Ftab%3Dsecurity',
                            )}
                        >
                            {t('security.signInAgain')}
                        </Link>
                    </p>
                ) : null}
            </Dialog>

            <Card
                aria-labelledby='sessions-heading'
                className={embedded ? profileStyles.panel : styles.panel}
                padding={embedded ? 'none' : 'md'}
                variant={embedded ? 'outlined' : 'elevated'}
            >
                <h2
                    className={embedded ? profileStyles.panelTitle : undefined}
                    id='sessions-heading'
                >
                    {t('security.sessions')}
                </h2>
                {embedded ? (
                    <dl
                        className={`${styles.metadata ?? ''} ${profileStyles.panelSection}`}
                    >
                        <div>
                            <dt>{t('security.sessionExpires')}</dt>
                            <dd>
                                {session ? formatDate(session.expiresAt) : '—'}
                            </dd>
                        </div>
                    </dl>
                ) : null}
                <div
                    className={
                        embedded
                            ? `${styles.actions} ${profileStyles.panelSection}`
                            : styles.actions
                    }
                >
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
    embedded,
    onRename,
    onRevoke,
    passkey,
}: {
    embedded: boolean;
    onRename(): void;
    onRevoke(): void;
    passkey: PasskeyMetadata;
}) {
    const { formatDate, t } = useI18n();

    return (
        <li className={embedded ? profileStyles.dataRow : styles.listItem}>
            {embedded ? (
                <span aria-hidden='true' className={profileStyles.rowIcon}>
                    <Fingerprint size={18} />
                </span>
            ) : null}
            <div className={embedded ? profileStyles.rowCopy : undefined}>
                <strong
                    className={embedded ? profileStyles.rowName : undefined}
                >
                    {passkey.name}
                </strong>
                <small
                    className={
                        embedded ? profileStyles.rowDescription : undefined
                    }
                >
                    {t('security.added', {
                        date: formatDate(passkey.createdAt),
                    })}
                    {passkey.lastUsedAt
                        ? ` · ${t('security.lastUsed', {
                              date: formatDate(passkey.lastUsedAt),
                          })}`
                        : ` · ${t('security.notUsedYet')}`}
                </small>
            </div>
            <div
                className={[
                    styles.actions,
                    embedded ? profileStyles.rowActions : undefined,
                ]
                    .filter(Boolean)
                    .join(' ')}
            >
                <IconButton
                    icon={<Pencil size={16} />}
                    label={t('security.renameNamed', { name: passkey.name })}
                    onClick={onRename}
                    size='sm'
                    type='button'
                    variant='ghost'
                />
                <Button
                    aria-label={t('security.revokeNamed', {
                        name: passkey.name,
                    })}
                    leadingIcon={<Trash2 size={16} />}
                    onClick={onRevoke}
                    type='button'
                    variant='quiet'
                >
                    {t('security.revokePasskey')}
                </Button>
            </div>
        </li>
    );
}
