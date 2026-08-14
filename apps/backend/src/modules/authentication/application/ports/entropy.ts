export interface EntropySource {
    randomBytes(byteLength: number): Uint8Array;
}

export interface VerificationCodeGenerator {
    generate(): string;
}
