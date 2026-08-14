import { randomBytes } from 'node:crypto';

import type { EntropySource } from '../../application/ports/entropy';

export class NodeEntropySource implements EntropySource {
    public randomBytes(byteLength: number): Uint8Array {
        if (!Number.isSafeInteger(byteLength) || byteLength <= 0) {
            throw new RangeError(
                'Entropy length must be a positive safe integer.',
            );
        }

        return randomBytes(byteLength);
    }
}
