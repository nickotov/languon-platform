import type { LearningBlock } from '@languon/contracts';

/** Trusted server-created source authority; never accepted in a public job request. */
export interface KnowledgeLearningSourceBinding {
    kind: 'knowledge-block';
    actorId: string;
    noteId: string;
    noteOwnerId: string;
    blockId: string;
    sourceFingerprint: string;
    learningVersions?: { entryId: string; epoch: number }[];
    sourceSnapshot:
        | Pick<
              Extract<LearningBlock, { type: 'bilingual-text' }>,
              'type' | 'language' | 'segments'
          >
        | Pick<
              Extract<LearningBlock, { type: 'vocabulary' }>,
              'type' | 'language' | 'translationLanguage' | 'entries'
          >;
    grant: {
        kind: 'note' | 'workbook';
        locator: string;
        digest: string;
        version: number | null;
        workbookId: string | null;
    } | null;
}
