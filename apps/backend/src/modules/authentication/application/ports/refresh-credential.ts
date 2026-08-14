export interface RefreshCredential {
    digest: string;
    value: string;
}

export interface RefreshCredentialService {
    digest(value: string): string;
    issue(): RefreshCredential;
}
