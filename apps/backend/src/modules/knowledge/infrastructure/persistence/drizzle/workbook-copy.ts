import { randomUUID } from 'node:crypto';
import {
    KnowledgeNoteContentSchema,
    type KnowledgeBody,
} from '@languon/contracts';
import { KnowledgeDomainError } from '../../../domain/knowledge';

/** Remap only structural identities; literal learner text is never rewritten. */
export function copyWorkbookBody(
    body: KnowledgeBody,
    assetCopies?: ReadonlyMap<string, string>,
): KnowledgeBody {
    const ids = new Map<string, string>();
    const visit = (value: unknown): void => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) {
            value.forEach(visit);

            return;
        }

        const object = value as Record<string, unknown>;
        if (
            object.type === 'audio' &&
            typeof object.assetId === 'string' &&
            !assetCopies?.has(object.assetId)
        )
            throw new KnowledgeDomainError(
                'invalid_request',
                'Audio copies require independent asset ownership; this copy cannot be completed yet.',
            );
        if (typeof object.id === 'string' && !ids.has(object.id))
            ids.set(object.id, randomUUID());
        Object.values(object).forEach(visit);
    };

    visit(body.document);
    const remap = (value: unknown, key?: string): unknown => {
        if (Array.isArray(value))
            return value.map((child) => remap(child, key));
        if (typeof value === 'string' && key === 'assetId')
            return assetCopies?.get(value) ?? value;
        if (
            typeof value === 'string' &&
            key &&
            [
                'id',
                'blockId',
                'parentBlockId',
                'sourceSegmentId',
                'correctChoiceId',
                'segmentIds',
            ].includes(key)
        )
            return ids.get(value) ?? value;
        if (!value || typeof value !== 'object') return value;

        return Object.fromEntries(
            Object.entries(value).map(([name, child]) => [
                name,
                remap(child, name),
            ]),
        );
    };

    return KnowledgeNoteContentSchema.shape.body.parse(remap(body));
}
