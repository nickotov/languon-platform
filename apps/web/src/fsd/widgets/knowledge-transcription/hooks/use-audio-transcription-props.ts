'use client';
import { useRef } from 'react';
import { LearningBlockSchema } from '@languon/contracts';
import type {
    KnowledgeAudioTranscriptionProps,
    KnowledgeTranscriptionProps,
    TranscriptionAudioBlock,
} from '../types';

function snapshot(block: TranscriptionAudioBlock) {
    return JSON.stringify(LearningBlockSchema.parse(block));
}

/** The uploaded asset is authoritative; the transcript is accepted only into this dialog. */
export function useAudioTranscriptionProps(
    props: KnowledgeAudioTranscriptionProps,
): KnowledgeTranscriptionProps {
    const latest = useRef(props);
    latest.current = props;
    const captured = useRef<{ key: string; block: string } | null>(null);
    function key(value: KnowledgeAudioTranscriptionProps) {
        return JSON.stringify([value.noteId, value.branchId, value.language]);
    }
    return {
        noteId: props.noteId,
        blocks: props.block.assetId ? [props.block] : [],
        language: props.language,
        requestWithSession: props.requestWithSession,
        variant: 'focused',
        cancelOnUnmount: true,
        async flush() {
            const current = latest.current;
            const expected = {
                key: key(current),
                block: snapshot(current.block),
            };
            const frozenBlock = LearningBlockSchema.parse(current.block);
            const draft = await current.flush();
            if (
                draft.branchId !== current.branchId ||
                key(latest.current) !== expected.key ||
                snapshot(latest.current.block) !== expected.block
            )
                throw new Error('The local audio source changed.');
            captured.current = expected;
            return { ...draft, blocks: [frozenBlock] };
        },
        onApply(expected, replacement, source) {
            const current = latest.current;
            if (
                source.noteId !== current.noteId ||
                source.branchId !== current.branchId ||
                captured.current?.key !== key(current) ||
                captured.current.block !== snapshot(expected) ||
                snapshot(current.block) !== snapshot(expected)
            )
                return 'changed';
            current.onAccept(replacement);
            return 'applied';
        },
    };
}
