import type { WorkbookLearningShareAccess } from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import { WorkbookProgress } from '@/fsd/features/workbook-learning';
import { useI18n } from '@/fsd/shared/i18n';
export function WorkbookProgressSummary(props: {
    workbookId: string;
    workbookVersion: number;
    access?: WorkbookLearningShareAccess | undefined;
}) {
    const { requestWithSession } = useAuth();
    const { locale } = useI18n();
    const actorId = useSessionStore((state) => state.user?.id);
    return (
        <WorkbookProgress
            {...props}
            actorId={actorId}
            requestWithSession={requestWithSession}
            locale={locale}
        />
    );
}
