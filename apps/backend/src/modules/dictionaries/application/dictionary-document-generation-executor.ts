import {
    dictionaryDocumentGenerationFormat,
    type DictionaryDocumentMediaType,
} from '../domain/document-ingestion';
import type { DictionaryDocumentTermsGenerationInputPayload } from '../domain/generation';
import type { DictionaryGenerationFormatExecutor } from './ports/dictionary-generation-format-executor';
import type { DictionaryDocumentObjectReference } from './ports/private-document-storage';
import {
    DictionaryDocumentGenerationError,
    type DictionaryDocumentGenerationProcessor,
} from './dictionary-document-generation-processor';

export interface DictionaryDocumentGenerationExecutorUpload {
    checksumSha256: string;
    contentType: DictionaryDocumentMediaType;
    objectKey: string;
    sizeBytes: number;
    storageVersionId: string;
    uploadId: string;
}

export class DictionaryDocumentGenerationExecutor implements DictionaryGenerationFormatExecutor<
    typeof dictionaryDocumentGenerationFormat
> {
    public readonly format = dictionaryDocumentGenerationFormat;

    public constructor(
        private readonly dependencies: {
            loadUpload(input: {
                fencingToken: bigint;
                jobId: string;
                signal: AbortSignal;
                uploadId: string;
                workerId: string;
            }): Promise<DictionaryDocumentGenerationExecutorUpload | null>;
            processor: DictionaryDocumentGenerationProcessor;
        },
    ) {}

    public async execute(
        request: Omit<
            Parameters<
                DictionaryGenerationFormatExecutor<
                    typeof dictionaryDocumentGenerationFormat
                >['execute']
            >[0],
            'input'
        > & { input: DictionaryDocumentTermsGenerationInputPayload },
    ) {
        const upload = await this.dependencies.loadUpload({
            fencingToken: request.fencingToken,
            jobId: request.jobId,
            signal: request.signal,
            uploadId: request.input.uploadId,
            workerId: request.workerId,
        });
        if (!upload || upload.uploadId !== request.input.uploadId)
            throw new DictionaryDocumentGenerationError(
                'invalid_document',
                false,
            );
        const object: DictionaryDocumentObjectReference = { ...upload };
        return this.dependencies.processor.process({
            idempotencyKey: `${request.jobId}/document`,
            input: request.input,
            object,
            providerBudget: request.providerBudget,
            ...(request.reportStage
                ? { reportStage: request.reportStage }
                : {}),
            signal: request.signal,
        });
    }
}
