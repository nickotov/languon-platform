import type { TextAiJob } from '@languon/contracts';
import { useEffect, useState } from 'react';

export function useTextWorkspaceExpiry(
    job: TextAiJob | null,
    expired: boolean,
) {
    const [now, setNow] = useState(Date.now());
    const expiresAt = job?.createdAt
        ? Date.parse(job.createdAt) + 86_400_000
        : Infinity;

    useEffect(() => {
        if (job?.state !== 'completed') return;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [job]);
    return expired || now >= expiresAt;
}

export function useTextWorkspaceUnload(unsaved: boolean) {
    useEffect(() => {
        if (!unsaved) return;
        function unload(event: BeforeUnloadEvent) {
            event.preventDefault();
            event.returnValue = '';
        }
        window.addEventListener('beforeunload', unload);
        return () => window.removeEventListener('beforeunload', unload);
    }, [unsaved]);
}
