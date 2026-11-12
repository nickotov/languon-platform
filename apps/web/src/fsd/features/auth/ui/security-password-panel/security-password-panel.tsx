import type { FormEvent } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Card, Field, Input } from '@/fsd/shared/ui';
import { PasswordField } from '../password-field/password-field';
import styles from '../styles/auth-ui-common.module.css';
import profileStyles from '../styles/security-settings-common.module.css';

export function SecurityPasswordPanel({
    embedded,
    email,
    pending,
    onSubmit,
}: {
    embedded: boolean;
    email: string;
    pending: boolean;
    onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
    const { t } = useI18n();

    return (
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
                        embedded ? profileStyles.panelDescription : undefined
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
                    aria-busy={pending}
                    className={
                        embedded
                            ? `${styles.form} ${profileStyles.panelForm}`
                            : styles.form
                    }
                    onSubmit={onSubmit}
                >
                    <Field label={t('common.email')}>
                        <Input
                            autoComplete='username'
                            name='email'
                            readOnly
                            type='email'
                            value={email}
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
                        disabled={pending}
                        type='submit'
                    >
                        {pending
                            ? t('reset.pending')
                            : t('security.changePassword')}
                    </Button>
                </form>
            </div>
        </Card>
    );
}
