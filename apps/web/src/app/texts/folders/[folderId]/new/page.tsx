import { redirect } from 'next/navigation';
export default async function Page({
    params,
}: {
    params: Promise<{ folderId: string }>;
}) {
    const { folderId } = await params;
    redirect(`/texts/new?folderId=${encodeURIComponent(folderId)}`);
}
