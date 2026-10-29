'use client';
import {
    useId,
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
} from 'react';
import type { LearningBlock } from '@languon/contracts';
import {
    blockForm,
    readBlockForm,
    type BlockKind,
    type BlockLanguageDefaults,
} from '../lib/learning-block-form';
import { useBilingualBlockDraft } from './use-bilingual-block-draft';
import { useBlockFieldAi } from './use-block-field-ai';
import type { KnowledgeBlockFieldAiContext } from '../api/block-field-ai-api';
import type { BlockAuthoringLabels } from '../ui/learning-block-authoring/block-labels';

/** Local draft parsing/validation and dirty lifecycle shared by single and grouped block editors. */
export function useBlockFormDraft({
    kind,
    block,
    labels,
    onClose,
    onApply,
    fieldAi,
    languageDefaults,
}: {
    kind: BlockKind;
    block?: LearningBlock | undefined;
    labels: BlockAuthoringLabels;
    onClose(): void;
    onApply(block: LearningBlock): boolean;
    fieldAi?: KnowledgeBlockFieldAiContext | undefined;
    languageDefaults?: BlockLanguageDefaults | undefined;
}) {
    const formId = useId();
    const [, refreshMountedForm] = useState(0);
    useEffect(() => {
        refreshMountedForm((value) => value + 1);
    }, []);
    const [format, setFormat] = useState(
        block?.type === 'exercise' ? block.format : 'free-text',
    );
    const [error, setError] = useState(false);
    const [dirty, setDirty] = useState(!block);
    const [confirming, setConfirming] = useState(false);
    const [preview, setPreview] = useState<LearningBlock | null>(null);
    const [definition, setDefinition] = useState(() =>
        blockForm(kind, block, languageDefaults),
    );
    const [translationKey, setTranslationKey] = useState(0);
    const [title, setTitle] = useState(block?.title ?? labels.view.kinds[kind]);
    const form = useRef<HTMLFormElement>(null);
    const original = useRef(block);
    const blockId = useRef(block?.id ?? crypto.randomUUID());
    const counts = useRef(
        Object.fromEntries(
            definition.groups.map((group) => [group.name, group.rows.length]),
        ),
    );
    const ai = useBlockFieldAi(fieldAi, blockId.current);
    function replaceDefinition(next: typeof definition) {
        setDefinition(next);
        setTranslationKey((value) => value + 1);
        setPreview(null);
    }
    const bilingual = useBilingualBlockDraft({
        kind,
        block,
        form,
        counts,
        definition,
        onDefinition: replaceDefinition,
    });
    function count(name: string, value: number) {
        counts.current[name] = value;
        setDirty(true);
    }
    function parse(report = true) {
        if (!form.current) return null;
        try {
            const data = new FormData(form.current);
            const result = readBlockForm(
                kind,
                data,
                counts.current,
                original.current,
                bilingual.read(data),
            );
            if (report) setError(false);
            return result;
        } catch {
            if (report) setError(true);
            return null;
        }
    }
    function submit(event: FormEvent) {
        event.preventDefault();
        const result = parse();
        if (result && !onApply(result)) setError(true);
    }
    function change(event: FormEvent<HTMLFormElement>) {
        if (event.target instanceof HTMLSelectElement && !event.target.name)
            return;
        setDirty(true);
        refreshMountedForm((value) => value + 1);
        const target = event.target;
        if (target instanceof HTMLInputElement && target.name === 'title')
            setTitle(target.value || labels.view.kinds[kind]);
        if (target instanceof HTMLSelectElement && target.name === 'format') {
            const next = target.value;
            if (
                next === 'free-text' ||
                next === 'multiple-choice' ||
                next === 'fill-in-the-blank'
            )
                setFormat(next);
        }
    }
    function requestClose() {
        if (confirming) setConfirming(false);
        else if (dirty) setConfirming(true);
        else onClose();
    }
    function keepEditing() {
        setConfirming(false);
    }
    function visibleField(name: string) {
        if (name === 'correctChoice') return format === 'multiple-choice';
        if (name === 'gapText') return format === 'fill-in-the-blank';
        if (name === 'acceptedAnswers') return format === 'free-text';
        return true;
    }
    function showPreview() {
        setPreview(parse());
    }
    const fields = definition.fields.filter((field) =>
        visibleField(field.name),
    );
    const groups = definition.groups.filter(
        (group) => group.name !== 'choices' || format === 'multiple-choice',
    );
    function handlePreparedTranslationChange(
        event: ChangeEvent<HTMLSelectElement>,
    ) {
        bilingual.switchLanguage(event.currentTarget.value);
    }
    function acceptAudio(audio: Extract<LearningBlock, { type: 'audio' }>) {
        if (audio.id !== blockId.current) return;
        original.current = audio;
        const next = blockForm('audio', audio, languageDefaults);
        counts.current = Object.fromEntries(
            next.groups.map((group) => [group.name, group.rows.length]),
        );
        setDefinition(next);
        setTranslationKey((value) => value + 1);
        setDirty(true);
        setError(false);
    }
    function uploaded(audio: Extract<LearningBlock, { type: 'audio' }>) {
        const current = parse(false);
        const previousAudio =
            original.current?.type === 'audio' ? original.current : undefined;
        const base = current?.type === 'audio' ? current : previousAudio;
        acceptAudio({
            ...audio,
            ...base,
            id: blockId.current,
            assetId: audio.assetId,
        });
    }
    function getAudioDraft(): Extract<LearningBlock, { type: 'audio' }> | null {
        if (kind !== 'audio') return null;
        const current = parse(false);
        if (current?.type === 'audio') return current;
        if (!form.current)
            return original.current?.type === 'audio'
                ? original.current
                : { id: blockId.current, type: 'audio' };
        return null;
    }
    return {
        formId,
        error,
        setError,
        dirty,
        confirming,
        title,
        preview,
        form,
        blockId,
        fields,
        groups,
        preparedTranslations: bilingual.preparedTranslations,
        translationReviewNeeded: bilingual.translationReviewNeeded,
        translationKey,
        ai,
        count,
        parse,
        submit,
        change,
        requestClose,
        keepEditing,
        showPreview,
        handlePreparedTranslationChange,
        uploaded,
        getAudioDraft,
        acceptAudio,
        setDirty,
    };
}
export type BlockFormDraft = ReturnType<typeof useBlockFormDraft>;
