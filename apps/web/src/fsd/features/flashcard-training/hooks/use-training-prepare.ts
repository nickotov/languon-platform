import { useEffect, useRef, useState } from 'react';
import { toApiError } from '../lib/api-error';
import type { ApiError } from '../lib/api-error';
import type {
    Configuration,
    LearningApi,
    PrepareResponse,
    Scope,
} from '../types';

export interface PrepareState {
    status: 'idle' | 'loading' | 'ready' | 'error';
    result?: PrepareResponse;
    error?: ApiError;
}

export function useTrainingPrepare(
    api: LearningApi,
    enabled: boolean,
    configuration: Configuration,
    scope: Scope,
) {
    const [prepare, setPrepare] = useState<PrepareState>({ status: 'idle' });
    const [attempt, setAttempt] = useState(0);
    const generation = useRef(0);
    const retryAt = useRef<number | undefined>(undefined);
    useEffect(() => {
        const current = ++generation.current;
        if (!enabled) {
            setPrepare({ status: 'idle' });
            return;
        }
        if (retryAt.current && retryAt.current > Date.now()) return;
        setPrepare({ status: 'loading' });
        const timer = setTimeout(() => {
            void api
                .prepare({ configuration, scope })
                .then((result) => {
                    if (generation.current === current)
                        setPrepare({ status: 'ready', result });
                })
                .catch((error) => {
                    if (generation.current === current) {
                        const apiError = toApiError(error);
                        retryAt.current = apiError.retryAt;
                        setPrepare({
                            status: 'error',
                            error: apiError,
                        });
                    }
                });
        }, 350);
        return () => {
            clearTimeout(timer);
            generation.current += 1;
        };
    }, [api, enabled, configuration, scope, attempt]);
    return {
        prepare,
        setPrepare,
        retryPrepare: () => {
            if (!retryAt.current || retryAt.current <= Date.now())
                setAttempt((value) => value + 1);
        },
        canRequest: () => !retryAt.current || retryAt.current <= Date.now(),
    };
}
