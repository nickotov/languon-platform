export interface DevelopmentPrincipal {
    email: string;
    id: string;
    status: 'active' | 'disabled' | 'pending';
    verifiedAt: Date | null;
}

export interface DevelopmentPrincipalReader {
    findById(id: string): Promise<DevelopmentPrincipal | null>;
}
