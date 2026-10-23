import type { DictionaryDocumentStore } from '../../../application/ports/dictionary-document-store';
import {
    defaultDictionaryGenerationProviderBudgetPolicy,
    type DictionaryGenerationProviderBudgetPolicy,
} from '../../../application/ports/dictionary-generation-provider-policy';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import { authorize } from './dictionary-document-authorization';
import { claimCleanup } from './dictionary-document-cleanup-claim';
import {
    completeCleanup,
    failCleanup,
    heartbeatCleanup,
} from './dictionary-document-cleanup-completion';
import {
    recordCleanupTombstone,
    recordDataVersionsDeleted,
} from './dictionary-document-cleanup-versions';
import type {
    Database,
    DictionaryDocumentPersistenceContext,
} from './dictionary-document-context';
import {
    recordDocumentProcessingFailure,
    terminalizeExtraction,
} from './dictionary-document-processing';
import {
    publishDocumentProposalAfterCleanup,
    stageDocumentProposal,
} from './dictionary-document-proposal';
import { completeUpload } from './dictionary-document-upload';
import {
    expireUploadAuthorizations,
    loadDocumentUploadForWorker,
    readUploadAuthorization,
} from './dictionary-document-upload-queries';
import { type DictionaryGenerationIdGenerator } from './drizzle-dictionary-generation-store';

export class DrizzleDictionaryDocumentStore implements DictionaryDocumentStore {
    private readonly context: DictionaryDocumentPersistenceContext;
    public constructor(
        database: Database,
        ids: DictionaryGenerationIdGenerator,
        generationStore: DictionaryGenerationStore,
        providerBudget: DictionaryGenerationProviderBudgetPolicy = defaultDictionaryGenerationProviderBudgetPolicy,
        aiCreditEnforcementEnabled = false,
    ) {
        this.context = {
            database,
            ids,
            generationStore,
            providerBudget,
            aiCreditEnforcementEnabled,
        };
    }

    public async expireUploadAuthorizations(
        input: Parameters<
            DictionaryDocumentStore['expireUploadAuthorizations']
        >[0],
    ) {
        return expireUploadAuthorizations(this.context, input);
    }

    public async readUploadAuthorization(
        input: Parameters<
            DictionaryDocumentStore['readUploadAuthorization']
        >[0],
    ) {
        return readUploadAuthorization(this.context, input);
    }

    public async authorize(
        input: Parameters<DictionaryDocumentStore['authorize']>[0],
    ) {
        return authorize(this.context, input);
    }

    public async completeUpload(
        input: Parameters<DictionaryDocumentStore['completeUpload']>[0],
    ) {
        return completeUpload(this.context, input);
    }

    public async loadDocumentUploadForWorker(
        input: Parameters<
            DictionaryDocumentStore['loadDocumentUploadForWorker']
        >[0],
    ) {
        return loadDocumentUploadForWorker(this.context, input);
    }

    public async stageDocumentProposal(
        input: Parameters<DictionaryDocumentStore['stageDocumentProposal']>[0],
    ) {
        return stageDocumentProposal(this.context, input);
    }

    public async publishDocumentProposalAfterCleanup(
        input: Parameters<
            DictionaryDocumentStore['publishDocumentProposalAfterCleanup']
        >[0],
    ) {
        return publishDocumentProposalAfterCleanup(this.context, input);
    }

    public async terminalizeExtraction(
        input: Parameters<DictionaryDocumentStore['terminalizeExtraction']>[0],
    ) {
        return terminalizeExtraction(this.context, input);
    }

    public async recordDocumentProcessingFailure(
        input: Parameters<
            DictionaryDocumentStore['recordDocumentProcessingFailure']
        >[0],
    ) {
        return recordDocumentProcessingFailure(this.context, input);
    }

    public async claimCleanup(
        input: Parameters<DictionaryDocumentStore['claimCleanup']>[0],
    ) {
        return claimCleanup(this.context, input);
    }

    public async recordCleanupTombstone(
        input: Parameters<DictionaryDocumentStore['recordCleanupTombstone']>[0],
    ) {
        return recordCleanupTombstone(this.context, input);
    }

    public async recordDataVersionsDeleted(
        input: Parameters<
            DictionaryDocumentStore['recordDataVersionsDeleted']
        >[0],
    ) {
        return recordDataVersionsDeleted(this.context, input);
    }

    public async completeCleanup(
        input: Parameters<DictionaryDocumentStore['completeCleanup']>[0],
    ) {
        return completeCleanup(this.context, input);
    }

    public async failCleanup(
        input: Parameters<DictionaryDocumentStore['failCleanup']>[0],
    ) {
        return failCleanup(this.context, input);
    }

    public async heartbeatCleanup(
        input: Parameters<DictionaryDocumentStore['heartbeatCleanup']>[0],
    ) {
        return heartbeatCleanup(this.context, input);
    }
}
