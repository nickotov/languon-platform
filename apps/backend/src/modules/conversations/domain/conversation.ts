import type {
    ConversationActionQuote,
    CopiedAttachment,
    ConversationSource,
} from '@languon/contracts';

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
    blockTarget?: {
        branchId: string;
        version: number;
        material?: SourceMaterial[];
    };
    version: string;
    title: string;
    description: string | null;
    studiedLanguage: string | null;
    provenance: 'saved' | 'draft';
    material: SourceMaterial[];
    scope?: 'complete' | 'selected-material' | 'workspace';
};

export class ConversationActionConfirmationRequired extends ConversationError {
    constructor(public readonly quote: ConversationActionQuote) {
        super(
            'action_confirmation_required',
            'The available budget permits a smaller response. Confirm the refreshed allowance to send.',
        );
    }
}

export const isReadOnlyKnowledgeSource = (
    source: ConversationSource,
): boolean =>
    source.kind === 'knowledge' &&
    (!!source.shareLocator || source.view === 'saved');
