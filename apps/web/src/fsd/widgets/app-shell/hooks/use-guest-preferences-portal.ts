'use client';

import { useCallback, useState } from 'react';

export function useGuestPreferencesPortal() {
    const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
        null,
    );

    // Stable identity keeps PopoverTrigger's composed ref from resetting the
    // portal target on every render. A dialog ancestor owns the modal top layer.
    const setSettingsTrigger = useCallback((node: HTMLButtonElement | null) => {
        if (node) setPortalContainer(node.closest('dialog'));
    }, []);

    return { portalContainer, setSettingsTrigger };
}
