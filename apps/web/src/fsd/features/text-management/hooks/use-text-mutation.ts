'use client';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    TextsApiError,
    type RequestWithTextSession,
} from '@/fsd/entities/texts';
import { useSessionStore } from '@/fsd/entities/session';
import { useI18n } from '@/fsd/shared/i18n';
import { showToast } from '@/fsd/shared/ui/toast/toast';

export function useTextMutation(request: RequestWithTextSession) {
    const { t } = useI18n();
    const query = useQueryClient();
    const lock = useRef(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    async function run<T>(
        operation: (token: string) => Promise<T>,
        saved: (value: T) => void,
        success?: string,
    ) {
        if (lock.current) return;
        lock.current = true;
        const actor = useSessionStore.getState().user?.id;
        setBusy(true);
        setError(null);
        try {
            const result = await request(operation);
            if (actor !== useSessionStore.getState().user?.id) return;
            await Promise.all([
                query.invalidateQueries({ queryKey: ['texts'] }),
                query.invalidateQueries({ queryKey: ['text-folders'] }),
            ]);
            if (actor !== useSessionStore.getState().user?.id) return;
            saved(result);
            if (success)
                showToast({
                    content: success,
                    tone: 'success',
                    dismissLabel: t('toast.dismiss'),
                });
        } catch (cause) {
            if (actor !== useSessionStore.getState().user?.id) return;
            const message =
                cause instanceof TextsApiError &&
                cause.detail.code === 'version_conflict'
                    ? t('texts.manage.conflict')
                    : t('texts.manage.failed');
            setError(message);
            showToast({
                content: message,
                tone: 'danger',
                dismissLabel: t('toast.dismiss'),
            });
        } finally {
            setBusy(false);
            lock.current = false;
        }
    }
    return { busy, error, run };
}
