import type {
    TextSelectionJob,
    TextSelectionRequest,
    TextAlignment,
} from '@languon/contracts';
import type {
    DictionaryCardAuthoringProviderInput,
    DictionaryCardAuthoringProviderDelta,
} from '../../domain/card-authoring';
import type {
    TextAiExecutionSnapshot,
    TextAiProviderBudgetPolicy,
} from '../../../text-ai/application/text-ai-provider-catalog';
export type SelectionSourceAuthority =
    | {
          kind: 'text';
          actorId: string;
          textId: string;
          version: number;
          share?: { id: string; keyDigest: string; version: number };
      }
    | { kind: 'translation-proposal'; ownerId: string; jobId: string };
export interface SelectionSourceDocument {
    sourceOwnerId: string;
    alignment: TextAlignment;
    sourceLanguage: string;
    targetLanguage: string;
    authority: SelectionSourceAuthority;
}
export interface SelectionLease {
    id: string;
    ownerId: string;
    workerId: string;
    fencingToken: number;
    attempt: number;
    input: DictionaryCardAuthoringProviderInput;
    budget: TextAiProviderBudgetPolicy;
    execution: TextAiExecutionSnapshot | null;
}
export interface TextSelectionStore {
    enqueue(
        ownerId: string,
        request: TextSelectionRequest,
        shareKey?: string,
    ): Promise<TextSelectionJob>;
    read(ownerId: string, id: string): Promise<TextSelectionJob>;
    cancel(ownerId: string, id: string): Promise<TextSelectionJob>;
    claim(workerId: string): Promise<SelectionLease | null>;
    heartbeat(lease: SelectionLease): Promise<boolean>;
    dispatch(lease: SelectionLease): Promise<boolean>;
    complete(
        lease: SelectionLease,
        delta: DictionaryCardAuthoringProviderDelta,
        usage?: {
            inputTokens: number;
            outputTokens: number;
            cacheReadTokens?: number;
            cacheWriteTokens?: number;
        },
    ): Promise<boolean>;
    fail(
        lease: SelectionLease,
        code: string,
        usage?: {
            inputTokens: number;
            outputTokens: number;
            cacheReadTokens?: number;
            cacheWriteTokens?: number;
        },
        retryDisposition?: 'conclusive-provider-failure',
    ): Promise<void>;
    releaseWorkerLeases(workerId: string): Promise<void>;
}
