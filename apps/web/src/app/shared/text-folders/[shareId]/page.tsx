import { SharedTextsPage } from '@/fsd/pages/texts';
export const metadata = {
    title: 'Languon',
    robots: { index: false, follow: false },
    referrer: 'no-referrer' as const,
};
export default async function Page({
    params,
}: {
    params: Promise<{ shareId: string }>;
}) {
    const { shareId } = await params;
    return <SharedTextsPage kind='folder' shareId={shareId} />;
}
