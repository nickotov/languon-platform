'use client';

import { create } from 'zustand';

type LayoutState = {
    editorOpen: boolean;
    tutorOpen: boolean;
    companions: ReadonlyMap<string, boolean>;
    publish(id: string, open: boolean): void;
    remove(id: string): void;
};

/** Generic mounted companion visibility shared by layout containers and chrome. */
export const useNavigationLayout = create<LayoutState>((set) => ({
    editorOpen: false,
    tutorOpen: false,
    companions: new Map(),
    publish(id, open) {
        set((state) => {
            if (state.companions.get(id) === open) return state;
            const companions = new Map(state.companions);
            companions.set(id, open);
            return {
                companions,
                editorOpen: true,
                tutorOpen: [...companions.values()].some(Boolean),
            };
        });
    },
    remove(id) {
        set((state) => {
            const companions = new Map(state.companions);
            companions.delete(id);
            return {
                companions,
                editorOpen: companions.size > 0,
                tutorOpen: [...companions.values()].some(Boolean),
            };
        });
    },
}));
