'use client';
import type { ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { SentenceLibraryPage } from '../sentence-library-page/sentence-library-page';

/** Keep the library's filters, loaded pages and selection mounted beneath its preview URL. */
export function SentenceLibraryRoute({
    dictionaryId,
    shareId,
    children,
}: {
    dictionaryId?: string;
    shareId?: string;
    children: ReactNode;
}) {
    const params = useParams<{ exampleId?: string }>();
    return (
        <>
            <SentenceLibraryPage
                {...(dictionaryId ? { dictionaryId } : {})}
                {...(shareId ? { shareId } : {})}
                {...(params.exampleId ? { exampleId: params.exampleId } : {})}
            />
            {children}
        </>
    );
}
