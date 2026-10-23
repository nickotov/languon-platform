import type { TextAlignment } from '@languon/contracts';
import type { DictionaryCryptography } from '../../../../dictionaries/application/ports/dictionary-cryptography';
import {
    type TextsContentDatabase,
    type TextsContentTransaction,
} from './text-content-support';

export interface TextProposalSaveInput {
    ownerId: string;
    jobId: string;
    textId: string;
    expectedVersion: number;
    folderId: string | null;
    now: Date;
}

export type TextProposalLoader = (
    tx: TextsContentTransaction,
    input: TextProposalSaveInput,
) => Promise<{
    sourceText: string;
    sourceLanguage: string;
    targetLanguage: string;
    alignment: TextAlignment;
}>;

export interface TextContentContext {
    readonly db: TextsContentDatabase;
    readonly ids: { generate(): string };
    readonly clock: { now(): Date };
    readonly crypto: DictionaryCryptography;
    readonly proposal: TextProposalLoader | undefined;
}
