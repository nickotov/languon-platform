import { create } from 'zustand';

interface AccessTokenState {
    accessToken: string | null;
    accessTokenExpiresAt: number | null;
    clear(): void;
    set(accessToken: string, expiresAt?: string): void;
}

export const useAccessTokenStore = create<AccessTokenState>((set) => ({
    accessToken: null,
    accessTokenExpiresAt: null,
    clear: () => set({ accessToken: null, accessTokenExpiresAt: null }),
    set: (accessToken, expiresAt) =>
        set({
            accessToken,
            accessTokenExpiresAt:
                expiresAt === undefined ? null : Date.parse(expiresAt) || 0,
        }),
}));

export const accessTokenStore = {
    clear: () => useAccessTokenStore.getState().clear(),
    get: () => useAccessTokenStore.getState().accessToken,
    getUsable: () => {
        const state = useAccessTokenStore.getState();
        // Refresh before dispatch, including writes which must never be replayed.
        // The server still authorizes the token, session and recent sign-in.
        if (
            state.accessTokenExpiresAt !== null &&
            state.accessTokenExpiresAt <= Date.now() + 30_000
        )
            return null;
        return state.accessToken;
    },
    set: (token: string, expiresAt?: string) =>
        useAccessTokenStore.getState().set(token, expiresAt),
};
