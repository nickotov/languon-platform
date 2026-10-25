import { BrowserApiError } from '@languon/browser-auth';
import { LearnerAiCreditBalanceSchema } from '@languon/contracts';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';

export const creditBalanceApi = {
    async read(token: string, signal?: AbortSignal) {
        const base = resolveApiUrl(
            process.env.NODE_ENV,
            process.env.NEXT_PUBLIC_API_URL,
        );
        const response = await fetch(`${base}/users/me/ai-credits`, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: 'include',
            cache: 'no-store',
            signal: signal
                ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
                : AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
            throw new BrowserApiError(response.status, {
                code: 'credit_balance_unavailable',
                correlationId: 'credit-balance-request',
                message: 'Credit balance could not be loaded.',
            });
        }
        return LearnerAiCreditBalanceSchema.parse(await response.json());
    },
};
