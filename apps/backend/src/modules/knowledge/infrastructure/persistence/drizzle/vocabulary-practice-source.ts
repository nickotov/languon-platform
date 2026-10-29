import { vocabularySemanticFingerprint } from './learning-epoch-semantics';
import {
    KnowledgeBodySchema,
    DictionaryLanguageTagSchema,
    type FlashcardConfiguration,
    type LearningBlock,
} from '@languon/contracts';
import type { VocabularyPracticeActor } from '../../../application/vocabulary-practice-store';
import { projectFlashcard } from '../../../../learning/domain/flashcard-projection';
import { LearningEntryUnavailableError } from '../../../../learning/domain/errors';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import type { KnowledgeTransaction } from './knowledge-transaction';
import { readLearnerNote } from './learner-access';
import { readLearningEpochs, requireLearningEpoch } from './learning-epochs';

type Vocabulary = Extract<LearningBlock, { type: 'vocabulary' }>;
/** Shared with sentence admission; callers keep this transaction open through the write. */
export async function readVocabularyPracticeSource(
    tx: KnowledgeTransaction,
    crypto: KnowledgeShareCrypto,
    source: VocabularyPracticeActor,
) {
    const note = await readLearnerNote(
        tx,
        crypto,
        source.actorId,
        source.noteId,
        source.access,
    );
    const body = KnowledgeBodySchema.parse(note.body);
    const block = body.document.content
        ?.map((node) => node.attrs?.block)
        .find(
            (block): block is Vocabulary =>
                block?.type === 'vocabulary' && block.id === source.blockId,
        );

    if (!block) throw new LearningEntryUnavailableError();
    const sourceLanguage = DictionaryLanguageTagSchema.parse(block.language);
    const targetLanguage = DictionaryLanguageTagSchema.parse(
        block.translationLanguage,
    );
    const epochs = await readLearningEpochs(tx, source.noteId);
    const entries = block.entries.map((entry) => ({
        ...entry,
        entryId: entry.id,
        learningVersion: requireLearningEpoch(
            epochs,
            'vocabulary',
            block.id,
            entry.id,
            vocabularySemanticFingerprint(block, entry),
        ).epoch,
        sourceText: entry.term,
        targetText: entry.translation,
    }));

    function project(
        entry: (typeof entries)[number],
        configuration: FlashcardConfiguration,
    ) {
        return projectFlashcard({
            entryId: entry.id,
            learningVersion: entry.learningVersion,
            sourceLanguage,
            targetLanguage,
            configuration,
            values: {
                source: entry.term,
                translation: entry.translation,
                transcription: entry.pronunciation ?? null,
                definition: entry.definition ?? null,
                example: entry.example ?? null,
                exampleTranslation: entry.exampleTranslation ?? null,
            },
            settings: {
                definitionEnabled: true,
                definitionLanguageRole: 'target',
                transcriptionEnabled: true,
                transcriptionNotation: 'custom',
                customNotationLabel: null,
                exampleEnabled: true,
                exampleLanguageRole: 'source',
                exampleTranslationEnabled: true,
                exampleTranslationLanguageRole: 'target',
            },
        });
    }

    return { note, block, entries, sourceLanguage, targetLanguage, project };
}

export type VocabularyPracticeContent = Awaited<
    ReturnType<typeof readVocabularyPracticeSource>
>;
