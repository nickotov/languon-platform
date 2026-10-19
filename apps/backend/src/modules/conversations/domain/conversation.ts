import type { CopiedAttachment } from '@languon/contracts';

export class ConversationError extends Error {
    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'ConversationError';
    }
}

export const conversationUnavailable = () =>
    new ConversationError(
        'conversation_not_found',
        'This conversation is unavailable.',
    );

export type SourceAuthority = {
    sourceOwnerId: string;
    share?: { id?: string; digest: string; version: number };
};

export type SourceMaterial = CopiedAttachment;
export type ConversationSourceSnapshot = {
    version: string;
    title: string;
    description: string | null;
    studiedLanguage: string;
    provenance: 'saved' | 'draft';
    material: SourceMaterial[];
    scope?: 'complete' | 'selected-material';
};
