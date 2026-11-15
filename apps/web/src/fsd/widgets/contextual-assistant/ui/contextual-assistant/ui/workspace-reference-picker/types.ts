import type { CopiedAttachment } from '@languon/contracts';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';

export type WorkspaceReferencePickerProps = {
    actorId: string;
    conversationId: string;
    request: ConversationSessionRequest;
    onAttach(attachment: CopiedAttachment): boolean;
    onClose(): void;
    onBack?: (() => void) | undefined;
    onResumeTyping?: ((text: string) => void) | undefined;
    active?: boolean | undefined;
};
