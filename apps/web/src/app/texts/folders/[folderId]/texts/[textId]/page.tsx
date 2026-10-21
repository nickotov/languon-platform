import { redirect } from 'next/navigation';
export default async function Page({
    params,
}: {
    params: Promise<{ folderId: string; textId: string }>;
}) {
    const { textId } = await params;
    redirect(`/texts/${textId}`);
}
