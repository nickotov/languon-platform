'use client';

import type {
    AuthenticationSuccessResponse,
    AuthCapabilitiesResponse,
} from '@languon/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import {
    currentAccessToken,
    useSessionStore,
} from '@/fsd/entities/session/model/session-store';
import { authApi, AuthApiError } from '@/fsd/shared/api/auth-api';
import { useI18n } from '@/fsd/shared/i18n';

import { RefreshCoordinator } from './refresh-coordinator';

interface AuthContextValue {
    acceptAuthentication(response: AuthenticationSuccessResponse): void;
    authenticate<T>(
        action: () => Promise<T>,
        outcome: (result: T) => AuthenticationSuccessResponse | undefined,
    ): Promise<T>;
    capabilities: AuthCapabilitiesResponse | null;
    capabilitiesError: string | null;
    refreshCapabilities(): Promise<void>;
    refreshSession(): Promise<AuthenticationSuccessResponse | null>;
    requestWithSession<T>(
        operation: (accessToken: string) => Promise<T>,
    ): Promise<T>;
    signOutEverywhere(): Promise<void>;
    signOutHere(): Promise<void>;
    clearLocalSession(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const coordinator = new RefreshCoordinator();
const REFRESH_REQUEST_TIMEOUT_MS = 10_000;

async function refreshWithDeadline(): Promise<AuthenticationSuccessResponse> {
    const controller = new AbortController();
    const timer = setTimeout(
        () => controller.abort(),
        REFRESH_REQUEST_TIMEOUT_MS,
    );
    try {
        return await authApi.refresh(controller.signal);
    } finally {
        clearTimeout(timer);
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const { t } = useI18n();
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: { retry: false, staleTime: 30_000 },
                },
            }),
    );
    const authenticate = useSessionStore((state) => state.authenticate);
    const signOut = useSessionStore((state) => state.signOut);
    const [capabilities, setCapabilities] =
        useState<AuthCapabilitiesResponse | null>(null);
    const [capabilitiesFailed, setCapabilitiesFailed] = useState(false);
    const capabilitiesError = capabilitiesFailed
        ? t('auth.capabilitiesUnavailable')
        : null;
    const bootstrapped = useRef(false);

    useEffect(
        () =>
            coordinator.subscribe((outcome) => {
                if (outcome) authenticate(outcome);
                else signOut();
            }),
        [authenticate, signOut],
    );

    const refreshSession = useCallback(
        () => coordinator.refresh(refreshWithDeadline),
        [],
    );

    const refreshCapabilities = useCallback(async () => {
        setCapabilitiesFailed(false);
        try {
            setCapabilities(await authApi.capabilities());
        } catch {
            setCapabilities(null);
            setCapabilitiesFailed(true);
        }
    }, []);

    useEffect(() => {
        if (bootstrapped.current) return;
        bootstrapped.current = true;
        void refreshSession();
        void refreshCapabilities();
    }, [refreshCapabilities, refreshSession]);

    const acceptAuthentication = useCallback(
        (response: AuthenticationSuccessResponse) => {
            coordinator.publishAuthenticated(response);
        },
        [],
    );

    const authenticateOperation = useCallback(
        <T,>(
            action: () => Promise<T>,
            outcome: (result: T) => AuthenticationSuccessResponse | undefined,
        ) => coordinator.authenticate(action, outcome),
        [],
    );

    const clearLocalSession = useCallback(() => {
        coordinator.publishSignedOut();
    }, []);

    const requestWithSession = useCallback(
        async <T,>(
            operation: (accessToken: string) => Promise<T>,
        ): Promise<T> => {
            let token = currentAccessToken();
            if (!token) token = (await refreshSession())?.accessToken ?? null;
            if (!token) {
                throw new AuthApiError(401, {
                    code: 'authentication_required',
                    correlationId: 'client-session-required',
                    message: 'Please sign in to continue.',
                });
            }

            try {
                return await operation(token);
            } catch (error) {
                if (!(error instanceof AuthApiError) || error.status !== 401)
                    throw error;
                const refreshed = await refreshSession();
                if (!refreshed) throw error;
                return operation(refreshed.accessToken);
            }
        },
        [refreshSession],
    );

    const signOutHere = useCallback(async () => {
        await coordinator.signOut(() =>
            authApi
                .logout(currentAccessToken() ?? undefined)
                .then(() => undefined),
        );
    }, []);

    const signOutEverywhere = useCallback(async () => {
        let token = currentAccessToken();
        if (!token) token = (await refreshSession())?.accessToken ?? null;
        if (!token) {
            throw new AuthApiError(401, {
                code: 'authentication_required',
                correlationId: 'client-session-required',
                message: 'Please sign in to continue.',
            });
        }
        await coordinator.signOut(() =>
            authApi.logoutAll(token).then(() => undefined),
        );
    }, [refreshSession]);

    const value = useMemo<AuthContextValue>(
        () => ({
            acceptAuthentication,
            authenticate: authenticateOperation,
            clearLocalSession,
            capabilities,
            capabilitiesError,
            refreshCapabilities,
            refreshSession,
            requestWithSession,
            signOutEverywhere,
            signOutHere,
        }),
        [
            acceptAuthentication,
            authenticateOperation,
            clearLocalSession,
            capabilities,
            capabilitiesError,
            refreshCapabilities,
            refreshSession,
            requestWithSession,
            signOutEverywhere,
            signOutHere,
        ],
    );

    return (
        <QueryClientProvider client={queryClient}>
            <AuthContext.Provider value={value}>
                {children}
            </AuthContext.Provider>
        </QueryClientProvider>
    );
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
}
