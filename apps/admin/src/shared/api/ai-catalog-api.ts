import {
    AdminAiCatalogDetailResponseSchema,
    AdminAiCatalogListResponseSchema,
    type AdminAiCatalogReference,
} from '@languon/contracts';
import { authorized } from './admin-api';

export const aiCatalogApi = {
    list: (signal?: AbortSignal) =>
        authorized(
            '/admin/ai-catalog',
            AdminAiCatalogListResponseSchema,
            signal,
        ),
    detail: (reference: AdminAiCatalogReference, signal?: AbortSignal) =>
        authorized(
            `/admin/ai-catalog/${reference.kind}/${encodeURIComponent(reference.id)}`,
            AdminAiCatalogDetailResponseSchema,
            signal,
        ),
};
