import { createHash } from 'node:crypto';
import { SENTENCE_LIMITS, type SentenceDirection } from '@languon/contracts';
import type { KnowledgeSentenceIdentity } from '../../../application/knowledge-sentence-store';
import type {
    SentenceEntry,
    SentenceGeneratedContent,
} from '../../../../learning/domain/sentence-types';
import { sentenceLanguageMatches } from '../../../../learning/domain/sentence-language';
import { sentenceGraphemeBoundaries } from '../../../../learning/domain/sentence-content';
import { DrizzleKnowledgeSentenceTransaction } from './knowledge-sentence-transaction';
import type { KnowledgeTransaction } from './knowledge-transaction';
import type { VocabularyPracticeContent } from './vocabulary-practice-source';

function seededOperation(value: unknown) {
    const raw = createHash('sha256')
        .update(JSON.stringify(value))
        .digest('hex')
        .slice(0, 32);

    return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-8${raw.slice(17, 20)}-${raw.slice(20)}`;
}

function authoredSentence(
    source: VocabularyPracticeContent,
    entry: VocabularyPracticeContent['entries'][number],
    direction: SentenceDirection,
): SentenceGeneratedContent | null {
    const forward = direction === 'source-to-target';
    const sourceText = forward ? entry.example : entry.exampleTranslation;
    const referenceTranslation = forward
        ? entry.exampleTranslation
        : entry.example;
    const word = forward ? entry.term : entry.translation;
    const hint = forward ? entry.translation : entry.term;
    const sourceLanguage = forward
        ? source.sourceLanguage
        : source.targetLanguage;
    const targetLanguage = forward
        ? source.targetLanguage
        : source.sourceLanguage;

    if (
        !sourceText ||
        !referenceTranslation ||
        [...sourceText].length > SENTENCE_LIMITS.sourceCodePoints ||
        [...referenceTranslation].length > SENTENCE_LIMITS.feedbackCodePoints ||
        hint.trim().toLocaleLowerCase(targetLanguage) ===
            referenceTranslation.trim().toLocaleLowerCase(targetLanguage) ||
        !sentenceLanguageMatches(sourceText, sourceLanguage, targetLanguage) ||
        !sentenceLanguageMatches(
            referenceTranslation,
            targetLanguage,
            sourceLanguage,
        )
    )
        return null;
    const pattern = new RegExp(
        word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'),
        'iu',
    );
    const match = pattern.exec(sourceText);
    if (!match) return null;
    const start = match.index;
    const end = start + match[0].length;
    const boundaries = sentenceGraphemeBoundaries(sourceText);
    const words = new Set([
        0,
        sourceText.length,
        ...Array.from(
            new Intl.Segmenter(sourceLanguage, { granularity: 'word' }).segment(
                sourceText,
            ),
        ).flatMap((segment) => [
            segment.index,
            segment.index + segment.segment.length,
        ]),
    ]);

    if (
        !boundaries.has(start) ||
        !boundaries.has(end) ||
        !words.has(start) ||
        !words.has(end)
    )
        return null;
    const pieces = [
        { text: sourceText.slice(0, start), start: 0, target: null },
        {
            text: match[0],
            start,
            target: {
                entryId: entry.entryId,
                occurrenceId: 'occurrence-1',
                hintId: 'hint-1',
            },
        },
        { text: sourceText.slice(end), start: end, target: null },
    ].filter((part) => part.text.length > 0);
    const provenance: SentenceEntry = {
        entryId: entry.entryId,
        learningVersion: entry.learningVersion,
        sourceText: word,
        targetText: hint,
    };

    return {
        sourceText,
        referenceTranslation,
        segments: pieces.map((piece, index) => ({
            id: `segment-${index + 1}`,
            start: piece.start,
            end: piece.start + piece.text.length,
            text: piece.text,
            target: piece.target,
        })),
        hints: [{ id: 'hint-1', text: hint }],
        targets: [provenance],
    };
}

/** Prepared author examples are copied privately, never generated or automatically graded. */
export async function seedKnowledgeSentenceExamples(
    tx: KnowledgeTransaction,
    identity: KnowledgeSentenceIdentity,
    source: VocabularyPracticeContent,
    direction: SentenceDirection,
    selected: readonly SentenceEntry[],
    now: Date,
) {
    const publisher = new DrizzleKnowledgeSentenceTransaction(tx);
    for (const candidate of selected) {
        const entry = source.entries.find(
            (entry) => entry.entryId === candidate.entryId,
        );

        if (!entry) continue;
        const content = authoredSentence(source, entry, direction);
        if (!content) continue;
        await publisher.publishGenerated({
            ...identity,
            jobId: seededOperation({
                kind: 'authored-example:v1',
                ...identity,
                entryId: entry.entryId,
                learningVersion: entry.learningVersion,
                direction,
            }),
            direction,
            sourceLanguage:
                direction === 'source-to-target'
                    ? source.sourceLanguage
                    : source.targetLanguage,
            targetLanguage:
                direction === 'source-to-target'
                    ? source.targetLanguage
                    : source.sourceLanguage,
            generationPolicyVersion: 1,
            content,
            provenance: content.targets,
            createdAt: now,
        });
    }
}
