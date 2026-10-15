import type { TextSelectionRequest } from '@languon/contracts';
import type { DictionaryAuthentication } from './ports/dictionary-authentication';
import type { TextSelectionStore } from './ports/text-selection-store';
export class TextSelectionService {
    constructor(
        private readonly authentication: DictionaryAuthentication,
        private readonly store: TextSelectionStore,
    ) {}
    async enqueue(
        token: string,
        request: TextSelectionRequest,
        shareKey?: string,
    ) {
        const principal = await this.authentication.authenticate(token);
        return this.store.enqueue(principal.userId, request, shareKey);
    }
    async read(token: string, id: string) {
        const principal = await this.authentication.authenticate(token);
        return this.store.read(principal.userId, id);
    }
    async cancel(token: string, id: string) {
        const principal = await this.authentication.authenticate(token);
        return this.store.cancel(principal.userId, id);
    }
}
