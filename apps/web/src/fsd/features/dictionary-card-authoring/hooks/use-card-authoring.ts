import { DictionaryCardValuesSchema } from '@languon/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import type {
    DictionaryCardAuthoringField,
    DictionaryCardFormProps,
} from '../types';
import { useCardDraft } from './use-card-draft';
import { useAuthoringAutoSave } from './use-authoring-auto-save';
import { previewCardEffectiveSettings } from '../lib/preview-card-effective-settings';
import { hasLoadedSourceDuplicate } from '../lib/duplicate-source';
import { isValidCardAuthoringSource } from '../lib/valid-authoring-source';
import { authoringSelections } from '../lib/apply-authoring-result';

export function useCardAuthoring(props: DictionaryCardFormProps) {
    const { ai, card, dictionary, onSave, existingSources = [] } = props;
    const state = useCardDraft(props);
    const autosave = useAuthoringAutoSave(props, state);
    const { draft, proposal, isLatestVersion } = state;
    const [generatingScope, setGeneratingScope] = useState<
        | { kind: 'all' }
        | { kind: 'field'; field: DictionaryCardAuthoringField }
        | null
    >(null);
    const effective = previewCardEffectiveSettings(
        dictionary.settings.values,
        draft.overrides,
    );
    const duplicate = hasLoadedSourceDuplicate(
        draft.values.source,
        existingSources,
    );
    const validValues = DictionaryCardValuesSchema.safeParse(
        draft.values,
    ).success;
    const validSource = isValidCardAuthoringSource(draft.values.source);
    const validTranslationContext =
        draft.translationContext === null ||
        (draft.translationContext.trim().length > 0 &&
            [...draft.translationContext].length <= 1000);
    const effectiveContext =
        draft.translationContext?.trim() ||
        dictionary.translationContext?.trim() ||
        null;
    const selectedSource = proposal?.sourceSuggestions?.find(
        ({ id, value }) =>
            state.activeVersion.selectedSuggestions.source === id &&
            value === draft.values.source.trim(),
    );
    const stale =
        state.staleResult ||
        Boolean(
            proposal &&
            ((proposal.source !== draft.values.source.trim() &&
                !selectedSource) ||
                ((state.activeVersion.generation?.format ?? ai?.format) ===
                'card-authoring:v3'
                    ? proposal.translationContext !== effectiveContext
                    : effectiveContext !== null)),
        );
    const active = ai?.job?.state === 'queued' || ai?.job?.state === 'running';
    const locked = Boolean(
        active ||
        ai?.pending ||
        ai?.successorActive ||
        props.pending ||
        autosave.autoSaveLocked,
    );
    useEffect(() => {
        if (!active && !ai?.pending) setGeneratingScope(null);
    }, [active, ai?.pending]);
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (locked || !validValues || !validTranslationContext) return;
        try {
            const restoring = Boolean(card) && !state.isLatestVersion;
            const selections =
                stale || restoring
                    ? []
                    : authoringSelections(state.activeVersion, effective);
            if (state.activeVersion.generation && !restoring)
                await onSave(draft, selections, state.activeVersion.generation);
            else await onSave(draft, selections);
        } catch {
            /* Owning mutation exposes recovery. */
        }
    }
    async function generate(
        scope:
            | { kind: 'all' }
            | { kind: 'field'; field: DictionaryCardAuthoringField },
    ) {
        if (
            !ai ||
            !validSource ||
            !validTranslationContext ||
            locked ||
            !isLatestVersion
        )
            return;
        if (
            scope.kind === 'field' &&
            scope.field === 'exampleTranslation' &&
            !draft.values.example?.trim()
        )
            return;
        const successor = Boolean(proposal) && !stale;
        const createsVersion =
            Boolean(card) || successor || state.versionCount > 1;
        setGeneratingScope(scope);
        if (createsVersion) state.beginSuccessor();
        try {
            await ai.onAction({
                discardedSuggestionIds: state.discardedSuggestionIds,
                draft,
                kind: 'generate',
                scope,
                successor,
            });
        } catch {
            state.cancelSuccessor();
            setGeneratingScope(null);
        }
    }
    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        void submit(event);
    }
    function generateField(field: DictionaryCardAuthoringField) {
        void generate({ kind: 'field', field });
    }
    function generateAll() {
        void generate({ kind: 'all' });
    }
    return {
        ...state,
        ...autosave,
        effective,
        duplicate,
        active,
        locked,
        stale,
        generatingScope,
        validSource,
        validValues,
        validTranslationContext,
        generateField,
        generateAll,
        handleSubmit,
    };
}
export type CardAuthoring = ReturnType<typeof useCardAuthoring>;
