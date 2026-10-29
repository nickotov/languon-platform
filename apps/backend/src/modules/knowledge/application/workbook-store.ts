import type {
    CopyWorkbookRequest,
    CreateWorkbookRequest,
    SetWorkbookNotesRequest,
    SharedWorkbook,
    UpdateWorkbookRequest,
    Workbook,
    WorkbookShare,
} from '@languon/contracts';

export interface WorkbookStore {
    list(ownerId: string): Promise<Workbook[]>;
    create(ownerId: string, input: CreateWorkbookRequest): Promise<Workbook>;
    get(ownerId: string, workbookId: string): Promise<Workbook>;
    update(
        ownerId: string,
        workbookId: string,
        input: UpdateWorkbookRequest,
    ): Promise<Workbook>;
    setNotes(
        ownerId: string,
        workbookId: string,
        input: SetWorkbookNotesRequest,
    ): Promise<Workbook>;
    delete(
        ownerId: string,
        workbookId: string,
        expectedVersion: number,
    ): Promise<void>;
    issueShare(
        ownerId: string,
        workbookId: string,
        expectedVersion: number,
    ): Promise<WorkbookShare>;
    revokeShare(
        ownerId: string,
        workbookId: string,
        expectedVersion: number,
    ): Promise<void>;
    copy(
        ownerId: string,
        workbookId: string,
        input: CopyWorkbookRequest & { expectedVersion: number },
    ): Promise<Workbook>;
    copyShared(
        ownerId: string,
        locator: string,
        key: string,
        input: CopyWorkbookRequest,
    ): Promise<Workbook>;
    readShared(locator: string, key: string): Promise<SharedWorkbook>;
}
