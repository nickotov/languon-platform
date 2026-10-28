import { createHash } from 'node:crypto';
import { nativeTextAiRequestPolicyRevision } from './text-ai-provider-catalog';

/** Native request policy changes require new checks without invalidating unchanged legacy routes. */
export function nativeTextPolicyFingerprint(base: string): string {
    return createHash('sha256')
        .update(`${base}:${nativeTextAiRequestPolicyRevision}`)
        .digest('hex');
}
