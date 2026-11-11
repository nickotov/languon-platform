import { useRef, useState } from 'react';
import { BrowserApiError } from '@languon/browser-auth';
import { useQueryClient } from '@tanstack/react-query';
import type {
    ApplyDictionaryChatSnippetRequest,
    DictionaryChatSnippet,
    DictionaryChatSnippetApplyMode,
    OwnedDictionary,
} from '@languon/contracts';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { showToast } from '@/fsd/shared/ui';
import { dictionarySnippetsApi } from '../api/dictionary-snippets-api';
import { snippetCopy, snippetCount } from '../lib/snippet-copy';
import type { DictionarySnippetContext } from '../types';

export function useSnippetApplication(
    snippet: DictionaryChatSnippet,
    context: DictionarySnippetContext,
    onApplying: (value: boolean) => void,
) {
    const { locale } = useI18n();
    const copy = snippetCopy(locale);
    const queryClient = useQueryClient();
    const [selected, setSelected] = useState(() =>
        snippet.cards.map((_, index) => index),
    );
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const [replacement, setReplacement] = useState<OwnedDictionary | null>(
        null,
    );
    const operation = useRef<ApplyDictionaryChatSnippetRequest | null>(null);
    const lastMode = useRef<DictionaryChatSnippetApplyMode | null>(null);
    const locked = useRef(false);

    function toggle(index: number) {
        operation.current = null;
        lastMode.current = null;
        setError(null);
        setSelected((current) =>
            current.includes(index)
                ? current.filter((value) => value !== index)
                : [...current, index].sort((a, b) => a - b),
        );
    }

    function toggleAll() {
        operation.current = null;
        lastMode.current = null;
        setError(null);
        setSelected((current) =>
            current.length === snippet.cards.length
                ? []
                : snippet.cards.map((_, index) => index),
        );
    }

    async function run(action: () => Promise<void>) {
        if (locked.current) {
            return;
        }

        locked.current = true;
        setPending(true);
        onApplying(true);
        setError(null);
        try {
            await action();
        } catch (failure) {
            const definitivelyRejected =
                failure instanceof BrowserApiError &&
                failure.status >= 400 &&
                failure.status < 500 &&
                failure.status !== 408;

            if (definitivelyRejected) {
                // A rejected write cannot have committed. Explicit Retry must use
                // current versions and reconfirm Replace against its current count.
                operation.current = null;
                setReplacement(null);
            }

            setError(failure);
        } finally {
            locked.current = false;
            setPending(false);
            onApplying(false);
        }
    }

    async function readCurrent() {
        const response = await context.requestWithSession((token) =>
            dictionaryApi.readDictionary(token, context.dictionaryId),
        );

        return response.dictionary;
    }

    async function apply(body: ApplyDictionaryChatSnippetRequest) {
        const result = await dictionarySnippetsApi.apply(
            context,
            snippet.id,
            body,
        );

        operation.current = null;
        lastMode.current = null;
        setReplacement(null);
        let content = snippetCount(copy.saved, result.addedCount);
        if (result.duplicateCount > 0) {
            content += ` ${snippetCount(copy.duplicates, result.duplicateCount)}`;
        }

        showToast({ content, dismissLabel: copy.dismiss, tone: 'success' });
        await Promise.all([
            queryClient.invalidateQueries({
                queryKey: ['dictionary', context.dictionaryId],
            }),
            queryClient.invalidateQueries({
                queryKey: ['dictionary-cards', context.dictionaryId],
            }),
            queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
            queryClient.invalidateQueries({ queryKey: ['library'] }),
        ]);
    }

    function createOperation(
        mode: DictionaryChatSnippetApplyMode,
        current: OwnedDictionary,
    ): ApplyDictionaryChatSnippetRequest {
        return {
            operationId: crypto.randomUUID(),
            mode,
            selectedIndices: [...selected],
            expectedDictionaryVersion: current.version,
            expectedSettingsVersion: current.settingsVersion,
        };
    }

    function requestApply(mode: DictionaryChatSnippetApplyMode) {
        if (selected.length === 0) {
            return;
        }

        void run(async () => {
            operation.current = null;
            lastMode.current = mode;
            const current = await readCurrent();
            if (mode === 'replace') {
                setReplacement(current);

                return;
            }

            const body = createOperation(mode, current);
            operation.current = body;
            await apply(body);
        });
    }

    function confirmReplace() {
        if (!replacement || selected.length === 0) {
            return;
        }

        const body = createOperation('replace', replacement);
        operation.current = body;
        setReplacement(null);
        void run(() => apply(body));
    }

    function retry() {
        const body = operation.current;
        if (body) {
            void run(() => apply(body));
        } else if (lastMode.current) {
            requestApply(lastMode.current);
        }
    }

    function cancelReplace() {
        setReplacement(null);
    }

    return {
        selected,
        toggle,
        toggleAll,
        pending,
        error,
        replacement,
        requestApply,
        confirmReplace,
        cancelReplace,
        retry,
        canRetry: lastMode.current !== null,
    };
}
