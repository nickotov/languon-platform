import {
    KnowledgeTranscriptionAdminApplyRequestSchema,
    KnowledgeTranscriptionAdminPreviewRequestSchema,
} from '@languon/contracts';
import { AdminAiSettingsConflictError } from '../../administration/application/administration-errors';
import type {
    TranscriptionAdminActor,
    TranscriptionAdminStore,
    TranscriptionAdminPreviewSigner,
} from './transcription-admin-store';

/** A reviewed preview is bound to the authenticated owner/session and exact mutation. */
export class TranscriptionAdminService {
    constructor(
        private readonly store: TranscriptionAdminStore,
        private readonly signer: TranscriptionAdminPreviewSigner,
        private readonly now: () => Date = () => new Date(),
    ) {}
    read() {
        return this.store.read();
    }
    async preview(actor: TranscriptionAdminActor, candidate: unknown) {
        const request =
            KnowledgeTranscriptionAdminPreviewRequestSchema.parse(candidate);
        const readiness = await this.store.preview(request);
        const expiresAt = new Date(
            this.now().getTime() + 5 * 60_000,
        ).toISOString();
        return {
            request,
            proof: {
                expiresAt,
                signature: this.signer.sign(actor, request, expiresAt),
            },
            readiness,
        };
    }
    async apply(actor: TranscriptionAdminActor, candidate: unknown) {
        const input =
            KnowledgeTranscriptionAdminApplyRequestSchema.parse(candidate);
        if (
            !this.signer.verify(
                actor,
                input.request,
                input.proof.expiresAt,
                input.proof.signature,
            )
        )
            throw new AdminAiSettingsConflictError();
        return this.store.apply(
            actor,
            input.request,
            new Date(input.proof.expiresAt),
        );
    }
}
