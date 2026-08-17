'use client';

import { useId, useState } from 'react';

import { useI18n } from '@/fsd/shared/i18n';
import { Button, Input } from '@/fsd/shared/ui';
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
        <div className={styles.form}>
            <label htmlFor={inputId}>{label}</label>
            <span className={styles.password}>
                <Input
                    aria-describedby={
                        autoComplete === 'new-password' ? hintId : undefined
                    }
                    autoComplete={autoComplete}
                    id={inputId}
                    maxLength={256}
                    name={name}
                    required
                    type={visible ? 'text' : 'password'}
                />
                <Button
                    aria-label={t('password.toggleLabel', {
                        action: visible ? t('common.hide') : t('common.show'),
                        label: label.toLowerCase(),
                    })}
                    variant='quiet'
                    onClick={() => setVisible((current) => !current)}
                    type='button'
                >
                    {visible ? t('common.hide') : t('common.show')}
                </Button>
            </span>
            {autoComplete === 'new-password' ? (
                <small id={hintId}>{t('password.hint')}</small>
            ) : null}
        </div>
    );
}
