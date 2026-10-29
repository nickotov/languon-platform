import { useQuery } from '@tanstack/react-query';
import type { WorkbookLearningShareAccess } from '@languon/contracts';
import { learningApi } from '../api/learning-api';
export interface WorkbookProgressOptions {
    workbookId: string;
    workbookVersion: number;
    actorId: string | undefined;
    access?: WorkbookLearningShareAccess | undefined;
    requestWithSession: <T>(
        operation: (token: string) => Promise<T>,
    ) => Promise<T>;
}
export function useWorkbookProgress(options: WorkbookProgressOptions) {
    const { workbookId, workbookVersion, actorId, access, requestWithSession } =
        options;
    return useQuery({
        queryKey: [
            'workbook-progress',
            actorId,
            workbookId,
            workbookVersion,
            access?.kind,
            access?.locator,
            access?.key,
        ],
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                learningApi.workbookProgress(token, workbookId, access, signal),
            ),
        enabled: Boolean(actorId),
        retry: false,
        gcTime: 0,
    });
}
