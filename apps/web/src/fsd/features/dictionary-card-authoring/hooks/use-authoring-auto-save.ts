import { useEffect, useRef, useState } from 'react';
import { DictionaryCardValuesSchema } from '@languon/contracts';
import type { DictionaryCardFormProps } from '../types';
import type { useCardDraft } from './use-card-draft';
import { authoringSelections } from '../lib/apply-authoring-result';
import { previewCardEffectiveSettings } from '../lib/preview-card-effective-settings';

export function useAuthoringAutoSave(
    props: DictionaryCardFormProps,
    state: ReturnType<typeof useCardDraft>,
) {
    const [status, setStatus] = useState<
        | 'idle'
        | 'saving'
        | 'saved'
        | 'failed'
        | 'refreshFailed'
        | 'invalid'
        | 'unchanged'
        | 'conflict'
    >('idle');
    const [freezeDraft, setFreezeDraft] = useState(false);
    const seen = useRef(new Set<string>());
    const latest = useRef({ props, state });
    latest.current = { props, state };
    const attempt =
        useRef<ReturnType<typeof useCardDraft>['appliedResult']>(null);
    const session = useRef(0);
    useEffect(
        () => () => {
            session.current++;
        },
        [],
    );
    useEffect(() => {
        session.current++;
        seen.current.clear();
        attempt.current = null;
        setStatus('idle');
        setFreezeDraft(false);
    }, [props.card?.id]);
    async function persist() {
        const result = attempt.current;
        const { props: currentProps } = latest.current;
        if (!result?.version.generation || !currentProps.onAutoSave) return;
        const guard = session.current;
        setStatus('saving');
        setFreezeDraft(true);
        try {
            const effective = previewCardEffectiveSettings(
                currentProps.dictionary.settings.values,
                result.version.draft.overrides,
            );
            const response = await currentProps.onAutoSave(
                result.version.draft,
                authoringSelections(result.version, effective),
                result.version.generation,
            );
            if (session.current !== guard) return;
            latest.current.state.markSaved(response.card);
            setStatus(response.unchanged ? 'unchanged' : 'saved');
            setFreezeDraft(false);
            attempt.current = null;
        } catch (error) {
            if (session.current !== guard) return;
            setStatus(
                error &&
                    typeof error === 'object' &&
                    'reloadRequired' in error &&
                    error.reloadRequired
                    ? 'conflict'
                    : error &&
                        typeof error === 'object' &&
                        'saved' in error &&
                        error.saved
                      ? 'refreshFailed'
                      : 'failed',
            );
            setFreezeDraft(
                Boolean(
                    error &&
                    typeof error === 'object' &&
                    'freezeDraft' in error &&
                    error.freezeDraft,
                ),
            );
        }
    }
    useEffect(() => {
        const result = state.appliedResult;
        if (
            !result ||
            result.session !== (props.card?.id ?? 'new') ||
            seen.current.has(result.key)
        )
            return;
        seen.current.add(result.key);
        if (!props.card || !props.onAutoSave || !result.version.generation)
            return;
        const draft = result.version.draft;
        if (
            !DictionaryCardValuesSchema.safeParse(draft.values).success ||
            (draft.translationContext !== null &&
                (!draft.translationContext.trim() ||
                    [...draft.translationContext].length > 1000))
        ) {
            setStatus('invalid');
            return;
        }
        attempt.current = result;
        void persist();
    }, [state.appliedResult, props.card, props.onAutoSave]);
    useEffect(() => {
        if (status !== 'failed' || freezeDraft || !attempt.current) return;
        if (state.draft !== attempt.current.version.draft) {
            // A definitive failure permits edits; never replay a stale candidate over them.
            attempt.current = null;
            setStatus('idle');
        }
    }, [state.draft, status, freezeDraft]);
    function retryAutoSave() {
        if (status === 'failed' || status === 'refreshFailed') void persist();
    }
    return {
        autoSaveStatus:
            (status === 'saved' || status === 'unchanged') && state.dirty
                ? ('idle' as const)
                : status,
        autoSaveLocked: freezeDraft || status === 'saving',
        retryAutoSave,
    };
}
