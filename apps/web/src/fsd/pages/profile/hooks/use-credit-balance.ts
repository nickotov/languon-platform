import { useQuery } from '@tanstack/react-query';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import { creditBalanceApi } from '../api/credit-balance-api';

export function useCreditBalance() {
    const ownerId = useSessionStore((state) => state.user?.id ?? null);
    const authenticated = useSessionStore(
        (state) => state.status === 'authenticated',
    );
    const { requestWithSession } = useAuth();
    return useQuery({
        queryKey: ['learner-credit-balance', ownerId],
        queryFn: ({ signal }) =>
            requestWithSession((token) => creditBalanceApi.read(token, signal)),
        enabled: authenticated && ownerId !== null,
        retry: false,
        gcTime: 0,
        refetchOnMount: 'always',
    });
}
