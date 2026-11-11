import type { ConversationSessionRequest } from '@/fsd/entities/conversation';

export type DictionarySnippetContext = {
    dictionaryId: string;
    conversationId: string;
    requestWithSession: ConversationSessionRequest;
};
