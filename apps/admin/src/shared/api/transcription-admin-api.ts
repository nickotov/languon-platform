import {
    KnowledgeTranscriptionAdminStateSchema,
    KnowledgeTranscriptionAdminPreviewSchema,
    KnowledgeTranscriptionAdminPreviewRequestSchema,
    KnowledgeTranscriptionAdminApplyRequestSchema,
    type KnowledgeTranscriptionAdminPreviewRequest,
    type KnowledgeTranscriptionAdminApplyRequest,
} from '@languon/contracts';
import { authorized, authorizedSingleRequest } from './admin-api';
export const transcriptionAdminApi = {
    read: (signal?: AbortSignal) =>
        authorized(
            '/admin/ai/transcription',
            KnowledgeTranscriptionAdminStateSchema,
            signal,
        ),
    preview: (
        input: KnowledgeTranscriptionAdminPreviewRequest,
        signal?: AbortSignal,
    ) =>
        authorizedSingleRequest(
            '/admin/ai/transcription/preview',
            input,
            KnowledgeTranscriptionAdminPreviewRequestSchema,
            KnowledgeTranscriptionAdminPreviewSchema,
            signal,
        ),
    apply: (
        input: KnowledgeTranscriptionAdminApplyRequest,
        signal?: AbortSignal,
    ) =>
        authorizedSingleRequest(
            '/admin/ai/transcription/apply',
            input,
            KnowledgeTranscriptionAdminApplyRequestSchema,
            KnowledgeTranscriptionAdminStateSchema,
            signal,
        ),
};
