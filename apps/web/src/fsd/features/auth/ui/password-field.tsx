'use client';

import { useId, useState } from 'react';

import { useI18n } from '@/fsd/shared/i18n';

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
        <div className='field'>
            <label htmlFor={inputId}>{label}</label>
            <span className='password-input'>
                <input
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
                <button
                    aria-label={t('password.toggleLabel', {
                        action: visible ? t('common.hide') : t('common.show'),
                        label: label.toLowerCase(),
                    })}
                    className='text-button password-input__toggle'
                    onClick={() => setVisible((current) => !current)}
                    type='button'
                >
                    {visible ? t('common.hide') : t('common.show')}
                </button>
            </span>
            {autoComplete === 'new-password' ? (
                <small id={hintId}>{t('password.hint')}</small>
            ) : null}
        </div>
    );
}
