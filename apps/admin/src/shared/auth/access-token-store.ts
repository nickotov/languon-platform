import { create } from 'zustand';

interface AccessTokenState {
    accessToken: string | null;
    clear(): void;
    set(accessToken: string): void;
}

export const useAccessTokenStore = create<AccessTokenState>((set) => ({
    accessToken: null,
    clear: () => set({ accessToken: null }),
    set: (accessToken) => set({ accessToken }),
}));

export const accessTokenStore = {
    clear: () => useAccessTokenStore.getState().clear(),
    get: () => useAccessTokenStore.getState().accessToken,
    set: (token: string) => useAccessTokenStore.getState().set(token),
};
