import { KnowledgeLibraryWorkingSourceSchema } from '@languon/contracts';
import type { KnowledgeLibraryContext } from '../api/library-copy-api';

/** Flush only private working recovery before preview. Commit uses this exact frozen request. */
export async function resolveLibraryCopySource(
    context: KnowledgeLibraryContext,
) {
    if (!context.workingSource) return { noteVersion: context.noteVersion };
    const source = context.resolveWorkingSource
        ? await context.resolveWorkingSource()
        : context.workingSource;
    return { workingSource: KnowledgeLibraryWorkingSourceSchema.parse(source) };
}
