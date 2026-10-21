type NavigationAction = () => void;
type NavigationGuard = (action: NavigationAction) => void;

const guards = new Map<symbol, NavigationGuard>();

/** Register only from a mounted client effect; no user data is retained. */
export function registerNavigationGuard(guard: NavigationGuard) {
    const id = Symbol();
    guards.set(id, guard);
    return () => {
        guards.delete(id);
    };
}

/** Palette and Create actions must honor the same draft guard as links. */
export function requestGuardedNavigation(action: NavigationAction) {
    const active = [...guards.values()].at(-1);
    if (active) active(action);
    else action();
}
