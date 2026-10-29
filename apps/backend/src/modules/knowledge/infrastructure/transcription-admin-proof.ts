import { createHmac, timingSafeEqual } from 'node:crypto';
import type { KnowledgeTranscriptionAdminPreviewRequest } from '@languon/contracts';
import type {
    TranscriptionAdminActor,
    TranscriptionAdminPreviewSigner,
} from '../application/transcription-admin-store';
export class TranscriptionAdminProof implements TranscriptionAdminPreviewSigner {
    private readonly secret: Buffer;
    constructor(
        secret: string | Uint8Array,
        private readonly credentialFingerprint: () => string | null = () =>
            null,
    ) {
        this.secret = createHmac('sha256', secret)
            .update('languon-knowledge-transcription-admin-v1')
            .digest();
    }
    sign(
        actor: TranscriptionAdminActor,
        request: KnowledgeTranscriptionAdminPreviewRequest,
        expiresAt: string,
    ) {
        return createHmac('sha256', this.secret)
            .update(
                JSON.stringify({
                    processingCredentialFingerprint:
                        this.credentialFingerprint(),
                    actorId: actor.userId,
                    sessionId: actor.sessionId,
                    request,
                    expiresAt,
                }),
            )
            .digest('base64url');
    }
    verify(
        actor: TranscriptionAdminActor,
        request: KnowledgeTranscriptionAdminPreviewRequest,
        expiresAt: string,
        signature: string,
    ) {
        const expected = Buffer.from(this.sign(actor, request, expiresAt));
        const supplied = Buffer.from(signature);
        return (
            expected.length === supplied.length &&
            timingSafeEqual(expected, supplied)
        );
    }
}
