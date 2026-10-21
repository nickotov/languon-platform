import { TextWorkspacePage } from '@/fsd/pages/texts';
export default async function Page({
    params,
}: {
    params: Promise<{ textId: string }>;
}) {
    const { textId } = await params;
    return <TextWorkspacePage textId={textId} />;
}
