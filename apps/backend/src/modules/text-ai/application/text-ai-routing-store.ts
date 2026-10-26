import type { z } from 'zod';
import type {
    TextAiRoutingCatalogEntrySchema,
    TextAiRoutingDisableRequest,
    TextAiRoutingPublishRequest,
    TextAiRoutingRevision,
} from '@languon/contracts';

export interface TextAiRoutingStore {
    current(): Promise<TextAiRoutingRevision | null>;
    catalog(): Promise<Array<z.infer<typeof TextAiRoutingCatalogEntrySchema>>>;
    publish(
        input: TextAiRoutingPublishRequest,
        actorId: string,
        at: Date,
        correlationId?: string,
    ): Promise<TextAiRoutingRevision>;
    disable(
        input: TextAiRoutingDisableRequest,
        actorId: string,
        at: Date,
        correlationId?: string,
    ): Promise<TextAiRoutingRevision>;
}
