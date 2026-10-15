import { TextWorkspacePage } from '@/fsd/pages/texts';
export default async function Page({
    params,
}: {
    params: Promise<{ folderId: string }>;
}) {
    const { folderId } = await params;
    return <TextWorkspacePage folderId={folderId} />;
}
