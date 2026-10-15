import type { TextDocument, TextFolder } from '@languon/contracts';
import type { RequestWithTextSession } from '@/fsd/entities/texts';

export type TextResource = TextFolder | TextDocument;
export type MutationProps<T> = {
    open: boolean;
    requestWithSession: RequestWithTextSession;
    onClose(): void;
    onSaved(value: T): void;
};
