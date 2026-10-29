import { createHash } from 'node:crypto';
import type {
    SentenceDirection,
    SentenceExercise,
    SentenceNextRequest,
    SentenceScope,
} from '@languon/contracts';
import {
    LearningEntryUnavailableError,
    LearningInvalidRequestError,
} from '../../../../learning/domain/errors';
import { sentenceLanguageMatches } from '../../../../learning/domain/sentence-language';
import type {
    SentenceCandidate,
    SentenceEntry,
} from '../../../../learning/domain/sentence-types';
import type { VocabularyPracticeContent } from './vocabulary-practice-source';
import type { knowledgeSentenceExercisesTable } from './knowledge-sentence-schema';

export type StoredKnowledgeSentence =
    typeof knowledgeSentenceExercisesTable.$inferSelect;
export function sourceSentenceEntries(
    source: VocabularyPracticeContent,
    direction: SentenceDirection,
    scope: SentenceScope,
) {
    if (
        scope.type === 'manual' &&
        scope.entryIds.some(
            (id) => !source.entries.some((entry) => entry.entryId === id),
        )
    )
        throw new LearningEntryUnavailableError();
    const selected = source.entries.filter(
        (entry) =>
            scope.type === 'all' || scope.entryIds.includes(entry.entryId),
    );
    const sourceLanguage =
        direction === 'source-to-target'
            ? source.sourceLanguage
            : source.targetLanguage;
    const targetLanguage =
        direction === 'source-to-target'
            ? source.targetLanguage
            : source.sourceLanguage;
    const entries: SentenceCandidate[] = selected
        .filter(
            (entry) =>
                sentenceLanguageMatches(
                    direction === 'source-to-target'
                        ? entry.term
                        : entry.translation,
                    sourceLanguage,
                    targetLanguage,
                ) &&
                sentenceLanguageMatches(
                    direction === 'source-to-target'
                        ? entry.translation
                        : entry.term,
                    targetLanguage,
                    sourceLanguage,
                ),
        )
        .map((entry, index) => ({
            entryId: entry.entryId,
            learningVersion: entry.learningVersion,
            sourceText:
                direction === 'source-to-target'
                    ? entry.term
                    : entry.translation,
            targetText:
                direction === 'source-to-target'
                    ? entry.translation
                    : entry.term,
            exposureCount: 0,
            sortKey: BigInt(index),
        }));

    return {
        entries,
        sourceLanguage,
        targetLanguage,
        skippedCount: selected.length - entries.length,
    };
}

export function currentKnowledgeSentence(
    row: StoredKnowledgeSentence,
    source: VocabularyPracticeContent,
) {
    if (!row.provenance.length) return false;
    const forward = row.publicContent.direction === 'source-to-target';

    return (
        row.publicContent.sourceLanguage ===
            (forward ? source.sourceLanguage : source.targetLanguage) &&
        row.publicContent.targetLanguage ===
            (forward ? source.targetLanguage : source.sourceLanguage) &&
        row.provenance.every((entry) =>
            source.entries.some(
                (current) =>
                    current.entryId === entry.entryId &&
                    current.learningVersion === entry.learningVersion,
            ),
        )
    );
}

export function sentenceRequestFingerprint(
    source: { noteId: string; blockId: string },
    input: SentenceNextRequest,
) {
    const normalized = { ...input };
    delete normalized.confirmedQuoteId;

    return createHash('sha256')
        .update(
            JSON.stringify({
                source,
                ...normalized,
                scope:
                    input.scope.type === 'manual'
                        ? {
                              type: 'manual',
                              entryIds: [...input.scope.entryIds].sort(),
                          }
                        : input.scope,
                visitedExerciseIds: [...input.visitedExerciseIds].sort(),
            }),
        )
        .digest('hex');
}

export function referenceFingerprint(
    noteId: string,
    blockId: string,
    exerciseId: string,
    input: unknown,
) {
    return createHash('sha256')
        .update(
            JSON.stringify({
                kind: 'knowledge-reference',
                noteId,
                blockId,
                exerciseId,
                input,
            }),
        )
        .digest('hex');
}

export function assertRequestedHints(
    exercise: SentenceExercise,
    hintIds: readonly string[],
) {
    if (hintIds.some((id) => !exercise.hints.some((hint) => hint.id === id)))
        throw new LearningInvalidRequestError();
}

export function sourceEpochs(entries: readonly SentenceEntry[]) {
    return Object.fromEntries(
        entries.map((entry) => [entry.entryId, entry.learningVersion]),
    );
}
