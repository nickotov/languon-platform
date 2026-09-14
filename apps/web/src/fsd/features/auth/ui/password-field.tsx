'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

import { useI18n } from '@/fsd/shared/i18n';
import { Input } from '@/fsd/shared/ui';
import styles from './auth-ui.module.css';

export function PasswordField({
    autoComplete,
    label,
    name,
}: {
    autoComplete: 'current-password' | 'new-password';
    label: string;
    name: string;
}) {
    const { t } = useI18n();
    const hintId = useId();
    const inputId = useId();
    const [visible, setVisible] = useState(false);

    return (
        <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor={inputId}>
                {label}
            </label>
            <span className={styles.password}>
                <Lock aria-hidden='true' className={styles.leadingIcon} />
                <Input
                    aria-describedby={
                        autoComplete === 'new-password' ? hintId : undefined
                    }
                    autoComplete={autoComplete}
                    controlSize='large'
                    id={inputId}
                    maxLength={256}
                    name={name}
                    required
                    type={visible ? 'text' : 'password'}
                />
                <button
                    aria-label={t('password.toggleLabel', {
                        action: visible ? t('common.hide') : t('common.show'),
                        label: label.toLowerCase(),
                    })}
                    className={styles.passwordToggle}
                    onClick={() => setVisible((current) => !current)}
                    type='button'
                >
                    {visible ? (
                        <EyeOff aria-hidden='true' />
                    ) : (
                        <Eye aria-hidden='true' />
                    )}
                </button>
            </span>
            {autoComplete === 'new-password' ? (
                <small id={hintId}>{t('password.hint')}</small>
            ) : null}
        </div>
    );
}
