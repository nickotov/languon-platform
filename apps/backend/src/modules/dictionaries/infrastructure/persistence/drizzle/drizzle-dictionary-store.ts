import type { DictionaryDeterministicImportResponse } from '@languon/contracts';
import type { DictionaryStore } from '../../../application/ports/dictionary-store';
import {
    dictionaryLimits,
    type DictionaryOwnerLimits,
} from '../../../domain/limits';
import type {
    DictionaryDatabase,
    DictionaryPersistenceContext,
} from './dictionary-context';
import { createCard, createDictionary } from './dictionary-creation';
import { streamDictionaryExport } from './dictionary-export';
import { forkSharedDictionary, replayForkDictionary } from './dictionary-forks';
import type { DictionaryIdGenerator } from './dictionary-id-generator';
import {
    authorizeDictionaryImportTarget,
    importDictionary,
    previewDictionaryImport,
} from './dictionary-import';
import {
    archiveCard,
    archiveDictionary,
    reorderCards,
    restoreCard,
    restoreDictionary,
} from './dictionary-lifecycle';
import {
    listCards,
    listDictionaries,
    readCard,
    readDictionary,
} from './dictionary-queries';
import {
    findSharedCandidate,
    readSharedDictionary,
    rotateShare,
} from './dictionary-sharing';
import { updateCard, updateDictionary } from './dictionary-updates';
import { DrizzleDictionaryDeletionStore } from './drizzle-dictionary-deletion-store';

export class DrizzleDictionaryStore implements DictionaryStore {
    private readonly context: DictionaryPersistenceContext;

    private readonly deletionStore: DrizzleDictionaryDeletionStore;
    public constructor(
        database: DictionaryDatabase,
        ids: DictionaryIdGenerator,
        ownerLimits: DictionaryOwnerLimits = dictionaryLimits,
    ) {
        this.deletionStore = new DrizzleDictionaryDeletionStore(database, ids);
        this.context = { database, ids, ownerLimits };
    }

    public async previewDictionaryDeletion(
        input: Parameters<DictionaryStore['previewDictionaryDeletion']>[0],
    ) {
        return this.deletionStore.previewDictionaryDeletion(input);
    }

    public async previewDictionaryCardDeletion(
        input: Parameters<DictionaryStore['previewDictionaryCardDeletion']>[0],
    ) {
        return this.deletionStore.previewDictionaryCardDeletion(input);
    }

    public async deleteDictionaries(
        input: Parameters<DictionaryStore['deleteDictionaries']>[0],
    ) {
        return this.deletionStore.deleteDictionaries(input);
    }

    public async deleteDictionaryCards(
        input: Parameters<DictionaryStore['deleteDictionaryCards']>[0],
    ) {
        return this.deletionStore.deleteDictionaryCards(input);
    }

    public async listDictionaries(
        input: Parameters<DictionaryStore['listDictionaries']>[0],
    ) {
        return listDictionaries(this.context, input);
    }

    public async authorizeDictionaryImportTarget(
        input: Parameters<
            DictionaryStore['authorizeDictionaryImportTarget']
        >[0],
    ): Promise<void> {
        return authorizeDictionaryImportTarget(this.context, input);
    }

    public async createDictionary(
        input: Parameters<DictionaryStore['createDictionary']>[0],
    ) {
        return createDictionary(this.context, input);
    }

    public readDictionary(
        input: Parameters<DictionaryStore['readDictionary']>[0],
    ) {
        return readDictionary(this.context, input);
    }

    public async previewDictionaryImport(
        input: Parameters<DictionaryStore['previewDictionaryImport']>[0],
    ) {
        return previewDictionaryImport(this.context, input);
    }

    public async importDictionary(
        input: Parameters<DictionaryStore['importDictionary']>[0],
    ): Promise<DictionaryDeterministicImportResponse> {
        return importDictionary(this.context, input);
    }

    public async updateDictionary(
        input: Parameters<DictionaryStore['updateDictionary']>[0],
    ) {
        return updateDictionary(this.context, input);
    }

    public archiveDictionary(
        input: Parameters<DictionaryStore['archiveDictionary']>[0],
    ) {
        return archiveDictionary(this.context, input);
    }

    public restoreDictionary(
        input: Parameters<DictionaryStore['restoreDictionary']>[0],
    ) {
        return restoreDictionary(this.context, input);
    }

    public async listCards(input: Parameters<DictionaryStore['listCards']>[0]) {
        return listCards(this.context, input);
    }

    public async streamDictionaryExport(
        input: Parameters<DictionaryStore['streamDictionaryExport']>[0],
    ): Promise<void> {
        return streamDictionaryExport(this.context, input);
    }

    public async createCard(
        input: Parameters<DictionaryStore['createCard']>[0],
    ) {
        return createCard(this.context, input);
    }

    public async readCard(input: Parameters<DictionaryStore['readCard']>[0]) {
        return readCard(this.context, input);
    }

    public async updateCard(
        input: Parameters<DictionaryStore['updateCard']>[0],
    ) {
        return updateCard(this.context, input);
    }

    public archiveCard(input: Parameters<DictionaryStore['archiveCard']>[0]) {
        return archiveCard(this.context, input);
    }

    public restoreCard(input: Parameters<DictionaryStore['restoreCard']>[0]) {
        return restoreCard(this.context, input);
    }

    public async reorderCards(
        input: Parameters<DictionaryStore['reorderCards']>[0],
    ) {
        return reorderCards(this.context, input);
    }

    public async rotateShare(
        input: Parameters<DictionaryStore['rotateShare']>[0],
    ) {
        return rotateShare(this.context, input);
    }

    public async findSharedCandidate(
        input: Parameters<DictionaryStore['findSharedCandidate']>[0],
    ) {
        return findSharedCandidate(this.context, input);
    }

    public async readSharedDictionary(
        input: Parameters<DictionaryStore['readSharedDictionary']>[0],
    ) {
        return readSharedDictionary(this.context, input);
    }

    public async forkSharedDictionary(
        input: Parameters<DictionaryStore['forkSharedDictionary']>[0],
    ) {
        return forkSharedDictionary(this.context, input);
    }

    public async replayForkDictionary(
        input: Parameters<DictionaryStore['replayForkDictionary']>[0],
    ) {
        return replayForkDictionary(this.context, input);
    }
}
