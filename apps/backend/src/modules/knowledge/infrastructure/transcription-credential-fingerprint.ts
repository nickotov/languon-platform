import { createHash } from 'node:crypto';

/** Internal equality pin only. Never return it through HTTP or log it.
 * Rotation conservatively invalidates organization/project attestations. */
export function transcriptionCredentialFingerprint(
    apiKey: string | undefined,
): string | null {
    return apiKey
        ? createHash('sha256')
              .update('languon-transcription-credential:v1\0')
              .update(apiKey)
              .digest('hex')
        : null;
}
