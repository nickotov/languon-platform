import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_CONFIGURATION } from '../lib/flashcard-fields';
import { toApiError } from '../lib/api-error';
import type { ApiError } from '../lib/api-error';
import type { Configuration, LearningApi, Preferences } from '../types';

export function useTrainingPreferences(
    open: boolean,
    signedIn: boolean,
    api: LearningApi,
) {
    const [draft, setDraft] = useState({
        configuration: DEFAULT_CONFIGURATION,
        shuffle: true,
    });
    const [prefsStatus, setPrefsStatus] = useState<
        'loading' | 'ready' | 'error'
    >('loading');
    const [conflict, setConflict] = useState<Preferences | null>(null);
    const [conflictBusy, setConflictBusy] = useState(false);
    const [overwriteDone, setOverwriteDone] = useState(false);
    const [startError, setStartError] = useState<ApiError | null>(null);
    const [prefsError, setPrefsError] = useState<ApiError | null>(null);
    const [attempt, setAttempt] = useState(0);
    const version = useRef(0);
    const generation = useRef(0);
    const busy = useRef(false);
    const retryAt = useRef<number | undefined>(undefined);

    useEffect(() => {
        const current = ++generation.current;
        busy.current = false;
        setConflict(null);
        setStartError(null);
        setPrefsError(null);
        setOverwriteDone(false);
        setConflictBusy(false);
        version.current = 0;
        setDraft({ configuration: DEFAULT_CONFIGURATION, shuffle: true });
        if (!open) return;
        if (!signedIn) {
            setPrefsStatus('ready');
            return;
        }
        setPrefsStatus('loading');
        void api
            .getPreferences()
            .then((preferences) => {
                if (generation.current !== current) return;
                setDraft({
                    configuration: preferences.configuration,
                    shuffle: preferences.shuffle,
                });
                version.current = preferences.version;
                setPrefsStatus('ready');
            })
            .catch((cause) => {
                if (generation.current !== current) return;
                const error = toApiError(cause);
                retryAt.current = error.retryAt;
                setPrefsError(error);
                setPrefsStatus('error');
            });
        return () => {
            generation.current += 1;
        };
    }, [open, signedIn, api, attempt]);

    const save = useCallback(
        async (overwrite = false): Promise<boolean> => {
            if (
                !open ||
                busy.current ||
                (retryAt.current && retryAt.current > Date.now())
            )
                return false;
            if (!signedIn) return true;
            if (prefsStatus !== 'ready' && !overwrite) return false;
            const current = generation.current;
            busy.current = true;
            setStartError(null);
            setConflictBusy(overwrite);
            try {
                const saved = await api.putPreferences({
                    ...draft,
                    expectedVersion:
                        overwrite && conflict
                            ? conflict.version
                            : version.current,
                });
                if (generation.current !== current) return false;
                version.current = saved.version;
                setConflict(null);
                setOverwriteDone(overwrite);
                return true;
            } catch (cause) {
                const error = toApiError(cause);
                if (generation.current !== current) return false;
                retryAt.current = error.retryAt;
                if (error.code === 'version_conflict') {
                    try {
                        const saved = await api.getPreferences();
                        if (generation.current === current) setConflict(saved);
                    } catch (fetchError) {
                        if (generation.current === current) {
                            const error = toApiError(fetchError);
                            retryAt.current = error.retryAt;
                            setStartError(error);
                        }
                    }
                } else setStartError(error);
                return false;
            } finally {
                if (generation.current === current) {
                    busy.current = false;
                    setConflictBusy(false);
                }
            }
        },
        [api, open, signedIn, prefsStatus, draft, conflict],
    );

    function reloadSaved() {
        if (!conflict || busy.current) return;
        setDraft({
            configuration: conflict.configuration,
            shuffle: conflict.shuffle,
        });
        version.current = conflict.version;
        setConflict(null);
        setStartError(null);
    }
    function setConfiguration(configuration: Configuration) {
        setDraft((previous) => ({ ...previous, configuration }));
    }
    function setShuffle(shuffle: boolean) {
        setDraft((previous) => ({ ...previous, shuffle }));
    }
    return {
        draft,
        setConfiguration,
        setShuffle,
        prefsStatus,
        conflict,
        conflictBusy,
        overwriteDone,
        startError,
        prefsError,
        setStartError,
        save,
        reloadSaved,
        overwrite: () => save(true),
        retryPrefs: () => {
            if (!retryAt.current || retryAt.current <= Date.now())
                setAttempt((value) => value + 1);
        },
        canRequest: () => !retryAt.current || retryAt.current <= Date.now(),
    };
}
