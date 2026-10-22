'use client';
import { useQuery } from '@tanstack/react-query';
import { useSessionStore } from '@/fsd/entities/session';
import { useI18n } from '@/fsd/shared/i18n';
import { preferencesApi, type SessionRequest } from '../../api/preferences-api';
import { budgetCopy, compactCredits } from '../../lib/action-budget';
import styles from './action-budget-summary.module.css';

export function ActionBudgetSummary({ request }: { request: SessionRequest }) {
    const actor = useSessionStore((state) => state.user?.id ?? null);
    const authenticated = useSessionStore(
        (state) => state.status === 'authenticated',
    );
    const { locale } = useI18n();
    const copy = budgetCopy(locale);
    const preference = useQuery({
        queryKey: ['text-ai-preference', actor],
        queryFn: () => request(preferencesApi.read),
        enabled: authenticated && actor !== null,
        retry: false,
        gcTime: 0,
        refetchOnWindowFocus: false,
    });
    if (!authenticated || !preference.data) return null;
    const maximum = preference.data.maxCreditsPerAction;
    if (maximum == null) return <p className={styles.summary}>{copy.unset}</p>;
    return (
        <details className={styles.summary}>
            <summary>
                {copy.maximum}: {compactCredits(maximum)}
            </summary>
            <p>
                {copy.exact}: {maximum}
            </p>
            <p>{copy.authorization}</p>
        </details>
    );
}
