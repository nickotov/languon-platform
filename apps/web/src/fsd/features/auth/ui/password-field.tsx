'use client';

import { useId, useState } from 'react';

export function PasswordField({
    autoComplete,
    label,
    name,
}: {
    autoComplete: 'current-password' | 'new-password';
    label: string;
    name: string;
}) {
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
                    aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
                    className='text-button password-input__toggle'
                    onClick={() => setVisible((current) => !current)}
                    type='button'
                >
                    {visible ? 'Hide' : 'Show'}
                </button>
            </span>
            {autoComplete === 'new-password' ? (
                <small id={hintId}>
                    Use 15–128 characters. Spaces and pasted passwords are
                    welcome.
                </small>
            ) : null}
        </div>
    );
}
