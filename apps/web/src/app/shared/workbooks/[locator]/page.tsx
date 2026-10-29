import { SharedWorkbookPage } from '@/fsd/pages/workbooks';
export default async function Page({
    params,
}: {
    params: Promise<{ locator: string }>;
}) {
    const { locator } = await params;
    return <SharedWorkbookPage locator={locator} />;
}
