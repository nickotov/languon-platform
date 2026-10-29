'use client';
import { useAudioTranscriptionProps } from '../../hooks/use-audio-transcription-props';
import type { KnowledgeAudioTranscriptionProps } from '../../types';
import { KnowledgeTranscription } from '../knowledge-transcription/knowledge-transcription';

export function KnowledgeAudioTranscription(
    props: KnowledgeAudioTranscriptionProps,
) {
    const state = useAudioTranscriptionProps(props);
    return (
        <KnowledgeTranscription
            key={`${props.noteId}:${props.branchId}:${props.block.id}:${props.language}`}
            {...state}
        />
    );
}
