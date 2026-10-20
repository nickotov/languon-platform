import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Keep the public capability out of database rows and HTTP URLs. */
export class KnowledgeShareCrypto {
    private readonly secret: Buffer;
    constructor(secret: string | Uint8Array) {
        this.secret = createHmac('sha256', secret)
            .update('languon-knowledge-shares-v1')
            .digest();
    }
    locator(): string {
        return randomBytes(24).toString('base64url');
    }
    key(locator: string): string {
        return createHmac('sha256', this.secret)
            .update(`capability\0${locator}`)
            .digest('base64url');
    }
    digest(key: string): string {
        return createHmac('sha256', this.secret)
            .update(`digest\0${key}`)
            .digest('base64url');
    }
    verify(key: string, digest: string | null): boolean {
        const expected = Buffer.from(this.digest(key));
        const actual = Buffer.from(
            digest && /^[A-Za-z0-9_-]{43}$/.test(digest)
                ? digest
                : 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        );
        return (
            actual.length === expected.length &&
            timingSafeEqual(actual, expected)
        );
    }
}
