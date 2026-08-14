import type {
    AuthenticationSuccessResponse,
    AuthSession,
    AuthUser,
} from '@languon/contracts';
import { create } from 'zustand';

export type SessionStatus = 'authenticated' | 'bootstrapping' | 'signed-out';

interface SessionState {
    accessToken: string | null;
    accessTokenExpiresAt: string | null;
    session: AuthSession | null;
    status: SessionStatus;
    user: AuthUser | null;
    authenticate(response: AuthenticationSuccessResponse): void;
    beginBootstrap(): void;
    signOut(): void;
}

export const useSessionStore = create<SessionState>((set) => ({
    accessToken: null,
    accessTokenExpiresAt: null,
    session: null,
    status: 'bootstrapping',
    user: null,
    authenticate: (response) =>
        set({
            accessToken: response.accessToken,
            accessTokenExpiresAt: response.accessTokenExpiresAt,
            session: response.session,
            status: 'authenticated',
            user: response.user,
        }),
    beginBootstrap: () => set({ status: 'bootstrapping' }),
    signOut: () =>
        set({
            accessToken: null,
            accessTokenExpiresAt: null,
            session: null,
            status: 'signed-out',
            user: null,
        }),
}));

export function currentAccessToken(): string | null {
    return useSessionStore.getState().accessToken;
}
