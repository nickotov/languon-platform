import { useQueryClient } from '@tanstack/react-query';
import {
    libraryCopyApi,
    type KnowledgeLibraryContext,
} from '../api/library-copy-api';
import type { PreparedLibraryCopy } from '../types';

export function useLibraryPublication() {
    const client = useQueryClient();
    return async function publish(
        context: KnowledgeLibraryContext,
        preview: PreparedLibraryCopy,
    ) {
        if (preview.kind === 'vocabulary') {
            const result = await libraryCopyApi.copyVocabulary(
                context,
                preview.request,
            );
            await Promise.all([
                client.invalidateQueries({
                    queryKey: ['dictionary-cards', result.dictionary.id],
                }),
                client.invalidateQueries({
                    queryKey: ['dictionary', result.dictionary.id],
                }),
                client.invalidateQueries({ queryKey: ['dictionaries'] }),
                client.invalidateQueries({
                    queryKey: ['dictionaries-navigation'],
                }),
                client.invalidateQueries({ queryKey: ['library-navigation'] }),
            ]);
        } else {
            const result = await libraryCopyApi.copyText(
                context,
                preview.request,
            );
            await Promise.all([
                client.invalidateQueries({
                    queryKey: ['text'],
                    predicate: (query) => query.queryKey[2] === result.text.id,
                }),
                client.invalidateQueries({ queryKey: ['texts'] }),
                client.invalidateQueries({ queryKey: ['text-folders'] }),
                client.invalidateQueries({ queryKey: ['library-navigation'] }),
            ]);
        }
    };
}
