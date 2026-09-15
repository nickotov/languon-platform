'use client';

import { UpdateHandleRequestSchema, type UpdateHandleResponse } from '@languon/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { useSessionStore } from '@/fsd/entities/session';
import { AuthApiError, authApi } from '@/fsd/shared/api/auth-api';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Field, Input } from '@/fsd/shared/ui';

import styles from './account-controls.module.css';

export function AccountHandleSettings({ requestWithSession }: {
    requestWithSession<T>(operation: (accessToken: string) => Promise<T>): Promise<T>;
}) {
    const { t } = useI18n();
    const handle = useSessionStore((state) => state.user?.handle ?? null);
    const updateUserHandle = useSessionStore((state) => state.updateUserHandle);
    const [draft, setDraft] = useState(handle ?? '');
    const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { setDraft(handle ?? ''); }, [handle]);

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (state === 'saving') return;
        const parsed = UpdateHandleRequestSchema.safeParse({ handle: draft });
        if (!parsed.success) { setError(t('profile.handleInvalid')); return; }
        setError(null);
        setState('saving');
        try {
            const response: UpdateHandleResponse = await requestWithSession((token) =>
                authApi.updateHandle(parsed.data, token));
            updateUserHandle(response.handle);
            setState('saved');
        } catch (caught) {
            setState('idle');
            setError(caught instanceof AuthApiError && caught.status === 409
                ? t('profile.handleConflict') : t('profile.handleError'));
        }
    }

    return <form className={styles.handleForm} onSubmit={save}>
        <Field {...(error ? { error } : {})} hint={t('profile.handleHelp')} label={t('profile.handleLabel')}
            {...(state === 'saved' ? { success: t('profile.handleSaved') } : {})} required>
            <Input autoComplete='off' disabled={state === 'saving'} maxLength={30}
                onChange={(event) => { setDraft(event.target.value); setError(null); setState('idle'); }}
                placeholder={t('profile.handlePlaceholder')} value={draft} />
        </Field>
        <Button disabled={state === 'saving' || draft.toLowerCase() === handle} type='submit'>
            {t(state === 'saving' ? 'profile.handleSaving' : 'profile.handleSave')}
        </Button>
    </form>;
}
