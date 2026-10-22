import type { ReactNode } from 'react';
import type {
    TextDocument,
    TextSelection,
    TextSelectionSource,
} from '@languon/contracts';
import type { RequestWithTextSession } from '@/fsd/entities/texts';
export type Side = 'source' | 'translation';
export type ReadingDocument = Pick<
    TextDocument,
    | 'id'
    | 'sourceLanguage'
    | 'targetLanguage'
    | 'sourceText'
    | 'alignment'
    | 'status'
    | 'version'
>;
export interface TextReadingProps {
    document: ReadingDocument;
    /** Actor/session identity only; never a credential or share capability. */
    collectionActorKey: string;
    source?: TextSelectionSource | null;
    shareKey?: string;
    requestWithSession?: RequestWithTextSession;
    matchMode: boolean;
    tab?: Side;
    onTabChange?: (side: Side) => void;
    topSlot?: ReactNode;
    collectionBudgetContent?: ReactNode;
    showEditedMarkers?: boolean;
    onRequireSignIn?: () => void;
    previewExpired?: boolean;
    collectionDisabled?: boolean;
}
export interface ReadingSelection {
    /** Live viewport geometry; offsets and selected text remain a fixed snapshot. */
    anchor?: {
        contextElement: Element;
        getBoundingClientRect(): DOMRect;
    };
    kind: 'valid' | 'cross' | 'long';
    text: string;
    sentence: string;
    sentenceStart: number;
    selection: TextSelection;
    rect: { top: number; left: number; width: number; height: number };
}
