import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import type { EntropySource } from '../../application/ports/entropy';
import type {
    RefreshCredential,
    RefreshCredentialService,
} from '../../application/ports/refresh-credential';

const refreshTokenByteLength = 32;

export class OpaqueRefreshTokenService implements RefreshCredentialService {
    public constructor(private readonly entropy: EntropySource) {}

    public digest(value: string): string {
        return createHash('sha256').update(value, 'utf8').digest('base64url');
    }

    public issue(): RefreshCredential {
        const randomBytes = this.entropy.randomBytes(refreshTokenByteLength);
        if (randomBytes.byteLength !== refreshTokenByteLength) {
            throw new Error(
                'The entropy source returned an invalid byte count.',
            );
        }

        const value = Buffer.from(randomBytes).toString('base64url');
        return { digest: this.digest(value), value };
    }
}
