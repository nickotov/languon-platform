import { TextWorkspacePage } from '@/fsd/pages/texts';
export default async function Page({
    params,
}: {
    params: Promise<{ folderId: string; textId: string }>;
}) {
    const values = await params;
    return <TextWorkspacePage {...values} />;
}
