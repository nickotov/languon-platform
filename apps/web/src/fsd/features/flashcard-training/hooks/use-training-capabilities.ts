import { useEffect, useState } from 'react';
import type { LearningApi } from '../types';

export function useTrainingCapabilities(api: LearningApi) {
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
        'loading',
    );
    const [enabled, setEnabled] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let alive = true;
        setStatus('loading');
        void api.capabilities().then(
            (result) => {
                if (alive) {
                    setEnabled(result.flashcardsEnabled);
                    setStatus('ready');
                }
            },
            () => {
                if (alive) setStatus('error');
            },
        );
        return () => {
            alive = false;
        };
    }, [api, attempt]);
    function retry() {
        setAttempt((current) => current + 1);
    }
    return { status, enabled, retry };
}
