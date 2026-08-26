import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

import type { DictionaryCryptography } from '../../application/ports/dictionary-cryptography';

export interface DictionaryEntropySource {
    randomBytes(byteLength: number): Uint8Array;
}

function canonicalJson(value: unknown): string {
    if (value === undefined) return 'null';
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
    }
    return `{${Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
        .join(',')}}`;
}

export class HmacDictionaryCryptography implements DictionaryCryptography {
    private readonly secret: Uint8Array;

    public constructor(input: {
        entropy: DictionaryEntropySource;
        secret: string | Uint8Array;
    }) {
        this.entropy = input.entropy;
        this.secret =
            typeof input.secret === 'string'
                ? Buffer.from(input.secret, 'utf8')
                : input.secret;
        if (this.secret.byteLength < 32) {
            throw new Error(
                'Dictionary HMAC secret must contain at least 32 bytes.',
            );
        }
    }

    private readonly entropy: DictionaryEntropySource;

    public fingerprint(value: unknown): string {
        return this.digest(
            `dictionary-idempotency\0${canonicalJson(value)}`,
            1,
        );
    }

    public issueShare(version: number, locator?: string) {
        const key = Buffer.from(this.entropy.randomBytes(32)).toString(
            'base64url',
        );
        return {
            digest: this.shareDigest(key, version),
            key,
            locator:
                locator ??
                Buffer.from(this.entropy.randomBytes(24)).toString('base64url'),
            version,
        };
    }

    public shareDigest(key: string, version: number): string {
        return this.digest(`share-key\0${key}`, version);
    }

    public verifyShare(key: string, storedDigest: string | null): boolean {
        const match = /^hmac-sha256:v([1-9][0-9]*):([A-Za-z0-9_-]{43})$/.exec(
            storedDigest ?? '',
        );
        const version = Number(match?.[1] ?? 1);
        const expected = Buffer.from(this.shareDigest(key, version));
        const actual = Buffer.from(
            match
                ? storedDigest!
                : 'hmac-sha256:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        );
        return (
            actual.byteLength === expected.byteLength &&
            timingSafeEqual(actual, expected)
        );
    }

    private digest(value: string, version: number): string {
        if (!Number.isSafeInteger(version) || version < 1) {
            throw new RangeError('Dictionary digest version must be positive.');
        }
        const digest = createHmac('sha256', this.secret)
            .update(value, 'utf8')
            .digest('base64url');
        return `hmac-sha256:v${version}:${digest}`;
    }
}
