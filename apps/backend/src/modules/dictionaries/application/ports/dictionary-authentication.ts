export interface DictionaryPrincipal {
    sessionId: string;
    userId: string;
}

export interface DictionaryAuthentication {
    authenticate(accessToken: string): Promise<DictionaryPrincipal>;
}
