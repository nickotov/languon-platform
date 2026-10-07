import { useEffect, useState } from 'react';

/** Re-enables recovery at the server deadline without retrying on the user's behalf. */
export function usePreparationRetryCooldown(
    deadline: number | undefined,
): boolean {
    const [, update] = useState(0);
    useEffect(() => {
        if (!deadline || deadline <= Date.now()) return;
        const timer = setTimeout(
            () => update((value) => value + 1),
            deadline - Date.now() + 1,
        );
        return () => clearTimeout(timer);
    }, [deadline]);
    return deadline !== undefined && deadline > Date.now();
}
