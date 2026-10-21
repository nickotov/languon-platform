import { MoveTextRequestSchema } from '@languon/contracts';
import { TextWorkspacePage } from '@/fsd/pages/texts';

export default async function Page({
    searchParams,
}: {
    searchParams: Promise<{
        folderId?: string;
        shareId?: string;
        shareVersion?: string;
    }>;
}) {
    const values = await searchParams;
    const parsed =
        MoveTextRequestSchema.shape.sharedFolderConfirmation.safeParse({
            shareId: values.shareId,
            shareVersion: Number(values.shareVersion),
        });
    return (
        <TextWorkspacePage
            folderId={values.folderId ?? null}
            {...(parsed.success
                ? { sharedFolderConfirmation: parsed.data }
                : {})}
        />
    );
}
