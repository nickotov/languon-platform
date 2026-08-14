export interface PasswordHash {
    encoded: string;
    parametersVersion: number;
}

export interface PasswordVerification {
    matches: boolean;
    needsRehash: boolean;
}

export interface PasswordHasherOperationOptions {
    signal?: AbortSignal;
}

export interface PasswordHasher {
    hash(
        password: string,
        options?: PasswordHasherOperationOptions,
    ): Promise<PasswordHash>;
    verify(
        password: string,
        passwordHash: PasswordHash,
        options?: PasswordHasherOperationOptions,
    ): Promise<PasswordVerification>;
}
