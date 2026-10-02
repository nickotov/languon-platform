import { useEffect, useMemo, useRef, useState } from 'react';
import { orderFields, sameFieldSet } from '../lib/flashcard-fields';
import { toApiError } from '../lib/api-error';
import type { Field, LearningApi, Scope, StartPayload } from '../types';
import { useTrainingPreferences } from './use-training-preferences';
import { useTrainingPrepare } from './use-training-prepare';
import { useRetryCooldown } from './use-retry-cooldown';

export type { StartPayload } from '../types';
export type { PrepareState } from './use-training-prepare';
interface Args {
    open: boolean;
    signedIn: boolean;
    activeCount: number;
    api: LearningApi;
}

export function useFlashcardSetup({ open, signedIn, activeCount, api }: Args) {
    const preferences = useTrainingPreferences(open, signedIn, api);
    const [scopeType, setScopeType] = useState<'all' | 'manual'>('all');
    const [manualIds, setManualIds] = useState<Set<string>>(new Set());
    const [starting, setStarting] = useState(false);
    const inFlight = useRef(false);
    const retryAt = useRef<number | undefined>(undefined);
    const generation = useRef(0);
    useEffect(() => {
        generation.current += 1;
        inFlight.current = false;
        retryAt.current = undefined;
        setStarting(false);
        setScopeType('all');
        setManualIds(new Set());
        return () => {
            generation.current += 1;
        };
    }, [open, signedIn, api]);

    const { front, back } = preferences.draft.configuration;
    const configuration = useMemo(
        () => ({ front: orderFields(front), back: orderFields(back) }),
        [front, back],
    );
    const scope = useMemo<Scope>(
        () =>
            scopeType === 'all'
                ? { type: 'all' }
                : { type: 'manual', entryIds: [...manualIds] },
        [scopeType, manualIds],
    );
    const frontError = front.length === 0;
    const backError = back.length === 0;
    const identicalSides = front.length > 0 && sameFieldSet(front, back);
    const scopeEmpty = scopeType === 'manual' && manualIds.size === 0;
    const canPrepare =
        open &&
        preferences.prefsStatus === 'ready' &&
        !frontError &&
        !backError &&
        !scopeEmpty &&
        activeCount > 0;
    const startRetryAt = preferences.startError?.retryAt;
    const startCooldown = useRetryCooldown(startRetryAt);
    const preparation = useTrainingPrepare(
        api,
        canPrepare && !starting && !startCooldown,
        configuration,
        scope,
    );
    const prepareCooldown = useRetryCooldown(
        preparation.prepare.error?.retryAt,
    );
    const canStart =
        canPrepare &&
        !startCooldown &&
        !prepareCooldown &&
        !preferences.conflict &&
        !starting &&
        !preferences.conflictBusy &&
        !(
            preparation.prepare.status === 'ready' &&
            preparation.prepare.result?.eligibleCount === 0
        );

    async function start(): Promise<StartPayload | null> {
        if (
            !canStart ||
            inFlight.current ||
            !preferences.canRequest() ||
            !preparation.canRequest() ||
            (retryAt.current && retryAt.current > Date.now())
        )
            return null;
        inFlight.current = true;
        setStarting(true);
        const current = generation.current;
        preferences.setStartError(null);
        try {
            const prepared = await api.prepare({ configuration, scope });
            if (generation.current !== current) return null;
            preparation.setPrepare({ status: 'ready', result: prepared });
            if (!prepared.entryIds.length) return null;
            if (!(await preferences.save())) return null;
            if (generation.current !== current) return null;
            return {
                configuration,
                shuffle: preferences.draft.shuffle,
                entryIds: prepared.entryIds,
                prepared,
            };
        } catch (error) {
            if (generation.current === current) {
                const apiError = toApiError(error);
                retryAt.current = apiError.retryAt;
                preferences.setStartError(apiError);
            }
            return null;
        } finally {
            if (generation.current === current) {
                setStarting(false);
                inFlight.current = false;
            }
        }
    }
    function toggleManual(entryId: string) {
        setManualIds((previous) => {
            const next = new Set(previous);
            if (next.has(entryId)) next.delete(entryId);
            else if (next.size < 10_000) next.add(entryId);
            return next;
        });
    }
    function setManualMany(ids: string[], selected: boolean) {
        setManualIds((previous) => {
            const next = new Set(previous);
            for (const id of ids) {
                if (!selected) next.delete(id);
                else if (next.size < 10_000) next.add(id);
            }
            return next;
        });
    }
    return {
        front,
        back,
        setFront: (fields: Field[]) =>
            preferences.setConfiguration({ front: fields, back }),
        setBack: (fields: Field[]) =>
            preferences.setConfiguration({ front, back: fields }),
        shuffle: preferences.draft.shuffle,
        setShuffle: preferences.setShuffle,
        scopeType,
        setScopeType,
        manualIds,
        toggleManual,
        setManualMany,
        clearManual: () => setManualIds(new Set()),
        prefsStatus: preferences.prefsStatus,
        retryPrefs: preferences.retryPrefs,
        conflict: preferences.conflict,
        conflictBusy: preferences.conflictBusy,
        overwriteDone: preferences.overwriteDone,
        reloadSaved: preferences.reloadSaved,
        overwrite: preferences.overwrite,
        ...preparation,
        frontError,
        backError,
        identicalSides,
        scopeEmpty,
        starting,
        startError: preferences.startError,
        startRetryAt,
        start,
        canStart,
    };
}
