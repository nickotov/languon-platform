import { KnowledgeDetailPage } from '@/fsd/pages/knowledge';
export default async function Page({
    params,
}: {
    params: Promise<{ noteId: string }>;
}) {
    const { noteId } = await params;
    return <KnowledgeDetailPage noteId={noteId} />;
}
