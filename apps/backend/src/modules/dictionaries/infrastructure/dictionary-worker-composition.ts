import type { PostgresJsDatabase } from '@languon/database';

import type { databaseSchema } from '../../../infrastructure/database/schema';
import { DictionaryGenerationWorkerService } from '../application/dictionary-generation-worker-service';
import type { CardProposalGenerator } from '../application/ports/card-proposal-generator';
import type { CardAuthoringProposalGenerator } from '../application/ports/card-authoring-proposal-generator';
import type { PastedTermsProposalGenerator } from '../application/ports/pasted-terms-proposal-generator';
import type { ImportPairsProposalGenerator } from '../application/ports/import-pairs-proposal-generator';
import type { DictionaryGenerationProviderBudgetPolicy } from '../application/ports/dictionary-generation-provider-policy';
import type { DictionaryClock } from '../application/dictionary-service';
import { DictionaryDocumentGenerationProcessor } from '../application/dictionary-document-generation-processor';
import { DictionaryDocumentGenerationExecutor } from '../application/dictionary-document-generation-executor';
import { DictionaryDocumentCleanupProcessor } from '../application/dictionary-document-cleanup-processor';
import type { PrivateDocumentStorage } from '../application/ports/private-document-storage';
import type { DocumentMalwareScanner } from '../application/ports/document-malware-scanner';
import type { SandboxedDocumentExtractor } from '../application/ports/sandboxed-document-extractor';
import type { DocumentOcrProvider } from '../application/ports/document-ocr-provider';
import {
    dictionaryGenerationFormat,
    dictionaryImportPairsGenerationFormat,
    dictionaryPastedTermsGenerationFormat,
} from '../domain/generation';
import { dictionaryDocumentGenerationFormat } from '../domain/document-ingestion';
import { dictionaryCardAuthoringGenerationFormat } from '../domain/card-authoring';
import {
    DrizzleDictionaryGenerationStore,
    type DictionaryGenerationIdGenerator,
} from './persistence/drizzle/drizzle-dictionary-generation-store';
import { DrizzleDictionaryDocumentStore } from './persistence/drizzle/drizzle-dictionary-document-store';

export interface DictionaryWorkerCompositionDependencies {
    cardAuthoringProvider?: CardAuthoringProposalGenerator;
    clock: DictionaryClock;
    database: PostgresJsDatabase<typeof databaseSchema>;
    ids: DictionaryGenerationIdGenerator;
    importPairsProvider?: ImportPairsProposalGenerator;
    options?: ConstructorParameters<
        typeof DictionaryGenerationWorkerService
    >[1];
    pastedTermsProvider: PastedTermsProposalGenerator;
    provider: CardProposalGenerator;
    providerBudget?: DictionaryGenerationProviderBudgetPolicy;
    supportedFormats: readonly string[];
    document?: {
        extractor: SandboxedDocumentExtractor;
        fingerprint: { fingerprint(value: unknown): string };
        ocr: DocumentOcrProvider;
        ocrEnabled: boolean;
        scanner: DocumentMalwareScanner;
        storage: PrivateDocumentStorage;
    };
}

export function createDictionaryWorkerComposition(
    dependencies: DictionaryWorkerCompositionDependencies,
) {
    const generationStore = new DrizzleDictionaryGenerationStore(
        dependencies.database,
        dependencies.ids,
        dependencies.providerBudget,
    );
    if (
        dependencies.supportedFormats.includes(
            dictionaryCardAuthoringGenerationFormat,
        ) &&
        !dependencies.cardAuthoringProvider
    )
        throw new Error(
            'Card-authoring provider is required for card-authoring:v1.',
        );
    if (
        dependencies.supportedFormats.includes(
            dictionaryDocumentGenerationFormat,
        ) &&
        !dependencies.document
    )
        throw new Error(
            'Document generation dependencies are required for document-terms:v1.',
        );
    if (
        dependencies.supportedFormats.includes(
            dictionaryImportPairsGenerationFormat,
        ) &&
        !dependencies.importPairsProvider
    )
        throw new Error(
            'Import-pairs provider is required for import-pairs:v1.',
        );
    const documentStore = dependencies.document
        ? new DrizzleDictionaryDocumentStore(
              dependencies.database,
              dependencies.ids,
              generationStore,
              dependencies.providerBudget,
          )
        : undefined;
    const documentProcessor =
        dependencies.document && documentStore
            ? new DictionaryDocumentGenerationProcessor({
                  clock: dependencies.clock,
                  extractor: dependencies.document.extractor,
                  fingerprint: dependencies.document.fingerprint,
                  ocr: dependencies.document.ocr,
                  proposalGenerator: dependencies.pastedTermsProvider,
                  scanner: dependencies.document.scanner,
                  storage: dependencies.document.storage,
              })
            : undefined;
    const documentExecutor =
        documentProcessor && documentStore
            ? new DictionaryDocumentGenerationExecutor({
                  loadUpload: (input) =>
                      documentStore.loadDocumentUploadForWorker({
                          context: {
                              now: dependencies.clock.now(),
                              signal: input.signal,
                          },
                          fencingToken: input.fencingToken,
                          jobId: input.jobId,
                          workerId: input.workerId,
                      }),
                  processor: documentProcessor,
              })
            : undefined;
    const documentCleanup =
        dependencies.document && documentStore
            ? new DictionaryDocumentCleanupProcessor({
                  clock: dependencies.clock,
                  storage: dependencies.document.storage,
                  store: documentStore,
              })
            : undefined;
    return {
        service: new DictionaryGenerationWorkerService(
            {
                ...(dependencies.cardAuthoringProvider
                    ? {
                          cardAuthoringProvider:
                              dependencies.cardAuthoringProvider,
                      }
                    : {}),
                clock: dependencies.clock,
                ...(documentCleanup ? { documentCleanup } : {}),
                ...(documentExecutor ? { documentExecutor } : {}),
                ...(documentStore ? { documentStore } : {}),
                ...(dependencies.importPairsProvider
                    ? { importPairsProvider: dependencies.importPairsProvider }
                    : {}),
                pastedTermsProvider: dependencies.pastedTermsProvider,
                provider: dependencies.provider,
                providerReadiness: async (signal) => {
                    const readiness: Array<Promise<void>> = [];
                    if (
                        dependencies.supportedFormats.includes(
                            dictionaryCardAuthoringGenerationFormat,
                        )
                    ) {
                        if (!dependencies.cardAuthoringProvider?.readiness)
                            throw new Error(
                                'Card-authoring provider readiness is unavailable.',
                            );
                        readiness.push(
                            dependencies.cardAuthoringProvider.readiness(
                                signal,
                            ),
                        );
                    }
                    if (
                        dependencies.supportedFormats.includes(
                            dictionaryImportPairsGenerationFormat,
                        )
                    ) {
                        if (!dependencies.importPairsProvider?.readiness)
                            throw new Error(
                                'Import-pairs provider readiness is unavailable.',
                            );
                        readiness.push(
                            dependencies.importPairsProvider.readiness(signal),
                        );
                    }
                    if (
                        dependencies.supportedFormats.includes(
                            dictionaryGenerationFormat,
                        ) ||
                        dependencies.supportedFormats.includes(
                            dictionaryPastedTermsGenerationFormat,
                        ) ||
                        dependencies.supportedFormats.includes(
                            dictionaryDocumentGenerationFormat,
                        )
                    ) {
                        if (!dependencies.provider.readiness) {
                            throw new Error(
                                'Dictionary provider readiness is unavailable.',
                            );
                        }
                        readiness.push(dependencies.provider.readiness(signal));
                    }
                    if (
                        dependencies.supportedFormats.includes(
                            dictionaryPastedTermsGenerationFormat,
                        ) ||
                        dependencies.supportedFormats.includes(
                            dictionaryDocumentGenerationFormat,
                        )
                    ) {
                        if (!dependencies.pastedTermsProvider.readiness) {
                            throw new Error(
                                'Pasted-terms provider readiness is unavailable.',
                            );
                        }
                        readiness.push(
                            dependencies.pastedTermsProvider.readiness(signal),
                        );
                    }
                    if (
                        dependencies.supportedFormats.includes(
                            dictionaryDocumentGenerationFormat,
                        )
                    ) {
                        const document = dependencies.document!;
                        if (!document.storage.readiness)
                            throw new Error(
                                'Document storage readiness is unavailable.',
                            );
                        readiness.push(
                            document.storage.readiness.call(
                                document.storage,
                                signal,
                            ),
                        );
                        for (const [name, probe] of [
                            ['scanner', document.scanner.readiness],
                            ['extractor', document.extractor.readiness],
                            ...(document.ocrEnabled
                                ? ([['OCR', document.ocr.readiness]] as const)
                                : []),
                        ] as const) {
                            if (!probe)
                                throw new Error(
                                    `Document ${name} readiness is unavailable.`,
                                );
                            readiness.push(
                                probe.call(
                                    name === 'scanner'
                                        ? document.scanner
                                        : name === 'extractor'
                                          ? document.extractor
                                          : document.ocr,
                                    signal,
                                ),
                            );
                        }
                    }
                    await Promise.all(readiness);
                },
                store: generationStore,
            },
            dependencies.options,
        ),
    };
}
