'use client';

import {
    UpdateHandleRequestSchema,
    type UpdateHandleResponse,
} from '@languon/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { AtSign, CheckCircle2 } from 'lucide-react';

import { useSessionStore } from '@/fsd/entities/session';
import { AuthApiError, authApi } from '@/fsd/shared/api/auth-api';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Input } from '@/fsd/shared/ui';

import styles from './account-controls.module.css';

export function AccountHandleSettings({
    className,
    requestWithSession,
}: {
    className?: string | undefined;
    requestWithSession<T>(
        operation: (accessToken: string) => Promise<T>,
    ): Promise<T>;
}) {
    const { t } = useI18n();

    const handle = useSessionStore((state) => state.user?.handle ?? null);

    const updateUserHandle = useSessionStore((state) => state.updateUserHandle);

    const [draft, setDraft] = useState(handle ?? '');

    const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');

    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setDraft(handle ?? '');
    }, [handle]);

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (state === 'saving') return;

        const parsed = UpdateHandleRequestSchema.safeParse({ handle: draft });

        if (!parsed.success) {
            setError(t('profile.handleInvalid'));

            return;
        }

        setError(null);

        setState('saving');

        try {
            const response: UpdateHandleResponse = await requestWithSession(
                (token) => authApi.updateHandle(parsed.data, token),
            );

            updateUserHandle(response.handle);

            setState('saved');
        } catch (caught) {
            setState('idle');

            setError(
                caught instanceof AuthApiError && caught.status === 409
                    ? t('profile.handleConflict')
                    : t('profile.handleError'),
            );
        }
    }

    return (
        <form
            className={[styles.handleForm, className].filter(Boolean).join(' ')}
            onSubmit={save}
        >
            <Input
                wrapperClassName={styles.handleField}
                autoComplete='off'
                disabled={state === 'saving'}
                {...(error
                    ? { error }
                    : {
                          hint:
                              state === 'saved'
                                  ? t('profile.handleSaved')
                                  : t('profile.handleHelp'),
                      })}
                label={t('profile.handleLabel')}
                leadingIcon={<AtSign size={16} />}
                maxLength={30}
                onChange={(event) => {
                    setDraft(event.target.value);

                    setError(null);

                    setState('idle');
                }}
                placeholder={t('profile.handlePlaceholder')}
                {...(state === 'saved'
                    ? { trailingIcon: <CheckCircle2 size={16} /> }
                    : {})}
                value={draft}
            />
            <Button
                className={styles.handleSubmit}
                disabled={state === 'saving' || draft.toLowerCase() === handle}
                size='compact'
                type='submit'
            >
                {t(
                    state === 'saving'
                        ? 'profile.handleSaving'
                        : 'profile.handleSave',
                )}
            </Button>
        </form>
    );
}
