import type { ReactNode } from 'react';
import { SentenceLibraryRoute } from '@/fsd/pages/sentence-library';
export default async function Layout({
    params,
    children,
}: {
    params: Promise<{ dictionaryId: string }>;
    children: ReactNode;
}) {
    const { dictionaryId } = await params;
    return (
        <SentenceLibraryRoute dictionaryId={dictionaryId}>
            {children}
        </SentenceLibraryRoute>
    );
}
