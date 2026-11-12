import type { PasskeyMetadata } from '@languon/contracts';
import { Fingerprint, Pencil, Trash2 } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, IconButton } from '@/fsd/shared/ui';
import styles from '../styles/auth-ui-common.module.css';
import profileStyles from '../styles/security-settings-common.module.css';

export function PasskeyRow({
    embedded,
    onRename,
    onRevoke,
    passkey,
}: {
    embedded: boolean;
    onRename(passkey: PasskeyMetadata): void;
    onRevoke(passkeyId: string): void;
    passkey: PasskeyMetadata;
}) {
    const { formatDate, t } = useI18n();

    function rename() {
        onRename(passkey);
    }

    function revoke() {
        onRevoke(passkey.id);
    }

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
                    onClick={rename}
                    size='sm'
                    type='button'
                    variant='ghost'
                />
                <Button
                    aria-label={t('security.revokeNamed', {
                        name: passkey.name,
                    })}
                    leadingIcon={<Trash2 size={16} />}
                    onClick={revoke}
                    type='button'
                    variant='quiet'
                >
                    {t('security.revokePasskey')}
                </Button>
            </div>
        </li>
    );
}
