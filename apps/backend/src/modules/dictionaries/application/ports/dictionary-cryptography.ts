export interface DictionaryShareMaterial {
    digest: string;
    key: string;
    locator: string;
    version: number;
}

export interface DictionaryCryptography {
    fingerprint(value: unknown): string;
    issueShare(version: number, locator?: string): DictionaryShareMaterial;
    shareDigest(key: string, version: number): string;
    verifyShare(key: string, storedDigest: string | null): boolean;
}
