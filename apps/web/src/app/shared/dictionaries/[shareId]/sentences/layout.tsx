import type { ReactNode } from 'react';
import { SentenceLibraryRoute } from '@/fsd/pages/sentence-library';
export default async function Layout({
    params,
    children,
}: {
    params: Promise<{ shareId: string }>;
    children: ReactNode;
}) {
    const { shareId } = await params;
    return (
        <SentenceLibraryRoute shareId={shareId}>
            {children}
        </SentenceLibraryRoute>
    );
}
