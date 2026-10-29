import { useState } from 'react';

/** A menu command resets local disclosure without remounting answers or playback. */
export function useBlockExpansion(
    command: { open: boolean; at: number } | undefined,
    initiallyOpen = false,
) {
    const [local, setLocal] = useState({
        at: command?.at,
        open: initiallyOpen,
    });
    const open =
        command?.at !== local.at
            ? (command?.open ?? initiallyOpen)
            : local.open;
    function toggle() {
        setLocal({ at: command?.at, open: !open });
    }
    return { open, toggle };
}
