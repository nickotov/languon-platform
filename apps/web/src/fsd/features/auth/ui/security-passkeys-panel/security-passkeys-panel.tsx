import type {
    AuthCapabilitiesResponse,
    PasskeyMetadata,
} from '@languon/contracts';
import { Fingerprint, Plus } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Card, InlineAlert } from '@/fsd/shared/ui';
import { localizedAuthError } from '../../lib/auth-error-message';
import { FormMessage } from '../auth-shell';
import { PasskeyRow } from '../passkey-row/passkey-row';
import styles from '../auth-ui.module.css';
import profileStyles from '../security-settings.module.css';

export function SecurityPasskeysPanel({
    embedded,
    capabilities,
    capabilitiesError,
    passkeyQuery,
    passkeys,
    registration,
    onRename,
    onRevoke,
}: {
    embedded: boolean;
    capabilities: AuthCapabilitiesResponse | null;
    capabilitiesError: string | null;
    passkeyQuery: {
        isSuccess: boolean;
        isPending: boolean;
        isError: boolean;
        error: unknown;
        refetch(): Promise<unknown>;
    };
    passkeys: PasskeyMetadata[];
    registration: {
        supported: boolean;
        pending: boolean;
        error: string | null;
        requiresRecentAuthentication: boolean;
        start(): Promise<void>;
        dismissError(): void;
    };
    onRename(passkey: PasskeyMetadata): void;
    onRevoke(passkeyId: string): void;
}) {
    const { href, t } = useI18n();
    const {
        supported: passkeySupported,
        pending: ceremonyPending,
        error: passkeyError,
        dismissError: onDismissError,
    } = registration;

    function startRegistration() {
        void registration.start();
    }

    function retryPasskeys() {
        void passkeyQuery.refetch();
    }

    return (
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
                    className={embedded ? profileStyles.headerLine : undefined}
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
                        onClick={startRegistration}
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
                        onDismiss={onDismissError}
                        title={t('security.passkeyActionFailed')}
                        tone='error'
                    >
                        {passkeyError}
                        {registration.requiresRecentAuthentication ? (
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
                    <InlineAlert tone='error'>{capabilitiesError}</InlineAlert>
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
                            onClick={retryPasskeys}
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
                            onClick={startRegistration}
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
                            onRename={onRename}
                            onRevoke={onRevoke}
                            passkey={passkey}
                        />
                    ))}
                </ul>
            </div>
        </Card>
    );
}
