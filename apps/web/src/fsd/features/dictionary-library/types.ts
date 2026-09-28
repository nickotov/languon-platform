import type { DictionarySummary } from '@languon/contracts';

import type { RequestWithSession } from '@/fsd/entities/dictionary';

export type DictionaryLibraryProps = {
    onOpenSettings(dictionary: DictionarySummary): void;
    requestWithSession: RequestWithSession;
};
