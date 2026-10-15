import { randomUUID } from 'node:crypto';
import type { DictionaryAuthentication } from '../application/ports/dictionary-authentication';
import { TextSelectionService } from '../application/text-selection-service';
import { TextSelectionWorker } from '../application/text-selection-worker';
import {
    DrizzleTextSelectionStore,
    type TextSelectionStoreOptions,
} from './persistence/drizzle/drizzle-text-selection-store';
import type { SelectionDatabase } from './persistence/drizzle/text-selection-target';
import type { CardAuthoringProposalGenerator } from '../application/ports/card-authoring-proposal-generator';
export function createTextSelectionModule(
    input: {
        database: SelectionDatabase;
        authentication: DictionaryAuthentication;
        generator: CardAuthoringProposalGenerator;
        workerId?: string;
        apiKeys?: Record<string, string | undefined>;
    } & TextSelectionStoreOptions,
) {
    const store = new DrizzleTextSelectionStore(input.database, input);
    const generator = input.generator;
    return {
        service: new TextSelectionService(input.authentication, store),
        store,
        worker: new TextSelectionWorker(
            store,
            generator,
            input.workerId ?? `text-selection:${randomUUID()}`,
            Math.max(100, Math.floor(input.leaseMs / 3)),
        ),
    };
}

export function createTextSelectionApiModule(
    input: {
        database: SelectionDatabase;
        authentication: DictionaryAuthentication;
    } & TextSelectionStoreOptions,
) {
    const store = new DrizzleTextSelectionStore(input.database, input);
    return {
        store,
        service: new TextSelectionService(input.authentication, store),
    };
}

export function createTextSelectionWorkerComposition(
    input: {
        database: SelectionDatabase;
        generator: CardAuthoringProposalGenerator;
        workerId: string;
    } & TextSelectionStoreOptions,
) {
    const store = new DrizzleTextSelectionStore(input.database, input);
    return {
        store,
        worker: new TextSelectionWorker(
            store,
            input.generator,
            input.workerId,
            Math.max(100, Math.floor(input.leaseMs / 3)),
        ),
    };
}
