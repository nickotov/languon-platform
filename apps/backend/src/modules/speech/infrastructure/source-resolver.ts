import type { StoredSpeechSource } from '../application/ports';
import { SpeechError } from '../domain/speech-policy';
import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from '@languon/database';
import type { SpeechSource } from '@languon/contracts';
import type { databaseSchema } from '../../../infrastructure/database/schema';
import type { DictionaryCryptography } from '../../dictionaries/application/ports/dictionary-cryptography';
import type { LearningAccess } from '../../learning/application/ports/learning-store';
import {
    authorizeLearningDictionary,
    learningCardSettings,
} from '../../dictionaries/infrastructure/persistence/drizzle/dictionary-learning-participant';
import { dictionaryCardsTable as cards } from '../../dictionaries/infrastructure/persistence/drizzle/schema';
import {
    sentenceAttemptsTable as attempts,
    sentenceManualReviewsTable as reviews,
} from '../../learning/infrastructure/persistence/drizzle/sentence-schema';
import { readableExercise } from '../../learning/infrastructure/persistence/drizzle/sentence-persistence-support';
import { assertSentencePracticeVisible } from '../../learning/infrastructure/persistence/drizzle/sentence-library-visibility';

type Database = PostgresJsDatabase<typeof databaseSchema>;
export type SpeechSourceTransaction = Parameters<
    Parameters<Database['transaction']>[0]
>[0];

/** Uses the same account/dictionary locks and visibility rules as learning writes. */
export class DrizzleSpeechSourceResolver {
    constructor(
        private readonly database: Database,
        private readonly cryptography: DictionaryCryptography,
    ) {}

    resolve(actorId: string, source: SpeechSource | StoredSpeechSource) {
        return this.database.transaction((tx) =>
            this.resolveInTransaction(actorId, source, tx),
        );
    }

    async resolveInTransaction(
        actorId: string,
        source: SpeechSource | StoredSpeechSource,
        tx: SpeechSourceTransaction,
    ): Promise<{
        text: string;
        language: string;
        revision: string;
        authority: StoredSpeechSource;
        dictionaryId: string;
        cardId?: string;
        exerciseId?: string;
        attemptId?: string;
    }> {
        const access: LearningAccess =
            source.access.kind === 'owner'
                ? {
                      kind: 'owner',
                      dictionaryId: source.access.dictionaryId,
                      learnerId: actorId,
                  }
                : {
                      kind: 'shared',
                      shareId: source.access.shareId,
                      keyDigest:
                          'shareKey' in source.access
                              ? this.cryptography.shareDigest(
                                    source.access.shareKey,
                                    1,
                                )
                              : source.access.keyDigest,
                      learnerId: actorId,
                  };
        const authority = {
            ...source,
            access:
                source.access.kind === 'owner'
                    ? source.access
                    : {
                          kind: 'shared' as const,
                          shareId: source.access.shareId,
                          keyDigest:
                              access.kind === 'shared' ? access.keyDigest : '',
                      },
        } as StoredSpeechSource;
        const owned = await authorizeLearningDictionary(tx, access);
        if (
            source.kind === 'dictionary-field' &&
            ((source.expectedDictionaryVersion !== undefined &&
                source.expectedDictionaryVersion !==
                    owned.dictionary.version) ||
                (source.expectedSettingsVersion !== undefined &&
                    source.expectedSettingsVersion !== owned.settings.version))
        ) {
            throw new SpeechError('speech_source_changed', 409);
        }
        if (
            source.kind === 'dictionary-field' ||
            source.kind === 'flashcard-field'
        ) {
            const [card] = await tx
                .select()
                .from(cards)
                .where(
                    and(
                        eq(cards.id, source.cardId),
                        eq(cards.dictionaryId, owned.dictionary.id),
                    ),
                )
                .for('share');
            if (
                !card ||
                card.lifecycle !== 'active' ||
                (source.kind === 'dictionary-field' &&
                    source.expectedVersion !== undefined &&
                    source.expectedVersion !== card.version) ||
                (source.kind === 'flashcard-field' &&
                    source.expectedLearningVersion !== undefined &&
                    source.expectedLearningVersion !== card.learningVersion)
            )
                throw new SpeechError('speech_source_unavailable', 404);
            const settings = learningCardSettings(owned.settings, card);
            const field =
                source.kind === 'flashcard-field' &&
                (source.field === 'sourceExample' ||
                    source.field === 'targetExample')
                    ? (source.field === 'sourceExample'
                          ? 'source'
                          : 'target') === settings.exampleLanguageRole
                        ? 'example'
                        : 'exampleTranslation'
                    : (source.field as
                          | 'source'
                          | 'translation'
                          | 'example'
                          | 'exampleTranslation');
            if (field === 'example' && !settings.exampleEnabled)
                throw new SpeechError('speech_source_unavailable', 404);
            if (
                field === 'exampleTranslation' &&
                !settings.exampleTranslationEnabled
            )
                throw new SpeechError('speech_source_unavailable', 404);
            const text = card[field];
            if (!text?.trim())
                throw new SpeechError('speech_source_unavailable', 404);
            const role =
                field === 'source'
                    ? 'source'
                    : field === 'translation'
                      ? 'target'
                      : field === 'example'
                        ? settings.exampleLanguageRole
                        : settings.exampleTranslationLanguageRole;
            return {
                authority,
                text,
                language:
                    role === 'source'
                        ? owned.dictionary.sourceLanguageTag
                        : owned.dictionary.targetLanguageTag,
                revision: `${owned.dictionary.version}:${owned.settings.version}:${card.version}`,
                dictionaryId: owned.dictionary.id,
                cardId: card.id,
            };
        }

        if (source.kind === 'checked-answer') {
            const [attempt] = await tx
                .select()
                .from(attempts)
                .where(
                    and(
                        eq(attempts.id, source.attemptId),
                        eq(attempts.learnerId, actorId),
                        eq(attempts.dictionaryId, owned.dictionary.id),
                    ),
                )
                .for('share');
            if (!attempt)
                throw new SpeechError('speech_source_unavailable', 404);
            const exercise = await readableExercise(
                tx,
                attempt.exerciseId,
                owned.dictionary.id,
                actorId,
                false,
            );
            return {
                authority,
                text: attempt.answer,
                language: exercise.publicContent.targetLanguage,
                revision: `${owned.dictionary.version}:${attempt.id}:${exercise.generationPolicyVersion}`,
                dictionaryId: owned.dictionary.id,
                exerciseId: exercise.id,
                attemptId: attempt.id,
            };
        }

        const exercise = await readableExercise(
            tx,
            source.exerciseId,
            owned.dictionary.id,
            actorId,
            source.kind === 'sentence-practice',
        );
        if (source.kind === 'sentence-practice')
            await assertSentencePracticeVisible(tx, exercise.id, actorId);
        if (
            source.kind === 'sentence-practice' &&
            source.field === 'reference'
        ) {
            const [review] = await tx
                .select({ id: reviews.id })
                .from(reviews)
                .where(
                    and(
                        eq(reviews.learnerId, actorId),
                        eq(reviews.exerciseId, exercise.id),
                        eq(reviews.sessionId, source.sessionId),
                    ),
                )
                .limit(1);
            const [attempt] = await tx
                .select({ id: attempts.id })
                .from(attempts)
                .where(
                    and(
                        eq(attempts.learnerId, actorId),
                        eq(attempts.exerciseId, exercise.id),
                        eq(attempts.sessionId, source.sessionId),
                        eq(attempts.referenceRevealed, true),
                    ),
                )
                .limit(1);
            if (!review && !attempt)
                throw new SpeechError('speech_reference_hidden', 403);
        }
        return {
            authority,
            text:
                source.field === 'prompt'
                    ? exercise.publicContent.sourceText
                    : exercise.referenceTranslation,
            language:
                source.field === 'prompt'
                    ? exercise.publicContent.sourceLanguage
                    : exercise.publicContent.targetLanguage,
            revision: `${owned.dictionary.version}:${exercise.id}:${exercise.generationPolicyVersion}`,
            dictionaryId: owned.dictionary.id,
            exerciseId: exercise.id,
        };
    }
}
