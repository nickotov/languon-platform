import * as c from '@languon/contracts';
import {
    copyResponseSchema,
    id,
    query,
    request,
    share,
    voidSchema,
} from './transport';
type Version = ReturnType<typeof c.TextVersionRequestSchema.parse>;
type CopyText = ReturnType<typeof c.CopySharedTextRequestSchema.parse>;
type CopyFolder = ReturnType<typeof c.CopySharedTextFolderRequestSchema.parse>;
function issue(
    accessToken: string,
    kind: 'text' | 'folder',
    resourceId: string,
    body: Version,
    signal?: AbortSignal,
) {
    return request(
        `/${kind === 'text' ? 'texts' : 'text-folders'}/${id(resourceId)}/share`,
        c.TextShareResponseSchema,
        { accessToken, signal },
        'POST',
        c.TextVersionRequestSchema.parse(body),
    );
}
function revoke(
    accessToken: string,
    kind: 'text' | 'folder',
    resourceId: string,
    body: Version,
    signal?: AbortSignal,
) {
    return request(
        `/${kind === 'text' ? 'texts' : 'text-folders'}/${id(resourceId)}/share`,
        voidSchema,
        { accessToken, signal },
        'DELETE',
        c.TextVersionRequestSchema.parse(body),
    );
}
function read(
    kind: 'text' | 'folder',
    shareId: string,
    key: string,
    values: Partial<c.ListTextsQuery> = {},
    signal?: AbortSignal,
) {
    const capability = share(shareId, key, kind);
    return request(
        `${capability.path}${query(values)}`,
        c.SharedTextResponseSchema,
        { headers: capability.headers, signal },
    );
}
export const sharingApi = {
    createTextShare: (
        token: string,
        textId: string,
        body: Version,
        signal?: AbortSignal,
    ) => issue(token, 'text', textId, body, signal),
    rotateTextShare: (
        token: string,
        textId: string,
        body: Version,
        signal?: AbortSignal,
    ) => issue(token, 'text', textId, body, signal),
    revokeTextShare: (
        token: string,
        textId: string,
        body: Version,
        signal?: AbortSignal,
    ) => revoke(token, 'text', textId, body, signal),
    createFolderShare: (
        token: string,
        folderId: string,
        body: Version,
        signal?: AbortSignal,
    ) => issue(token, 'folder', folderId, body, signal),
    rotateFolderShare: (
        token: string,
        folderId: string,
        body: Version,
        signal?: AbortSignal,
    ) => issue(token, 'folder', folderId, body, signal),
    revokeFolderShare: (
        token: string,
        folderId: string,
        body: Version,
        signal?: AbortSignal,
    ) => revoke(token, 'folder', folderId, body, signal),
    readSharedText: (
        shareId: string,
        key: string,
        values?: Partial<c.ListTextsQuery>,
        signal?: AbortSignal,
    ) => read('text', shareId, key, values, signal),
    readSharedFolder: (
        shareId: string,
        key: string,
        values?: Partial<c.ListTextsQuery>,
        signal?: AbortSignal,
    ) => read('folder', shareId, key, values, signal),
    copySharedText: (
        accessToken: string,
        shareId: string,
        key: string,
        body: CopyText,
        signal?: AbortSignal,
    ) => {
        const capability = share(shareId, key, 'text');
        return request(
            `${capability.path}/copy`,
            copyResponseSchema,
            { accessToken, signal, headers: capability.headers },
            'POST',
            c.CopySharedTextRequestSchema.parse(body),
        );
    },
    copySharedFolder: (
        accessToken: string,
        shareId: string,
        key: string,
        body: CopyFolder,
        signal?: AbortSignal,
    ) => {
        const capability = share(shareId, key, 'folder');
        return request(
            `${capability.path}/copy`,
            copyResponseSchema,
            { accessToken, signal, headers: capability.headers },
            'POST',
            c.CopySharedTextFolderRequestSchema.parse(body),
        );
    },
    copySharedFolderText: (
        accessToken: string,
        shareId: string,
        key: string,
        textId: string,
        body: CopyText,
        signal?: AbortSignal,
    ) => {
        const capability = share(shareId, key, 'folder');
        return request(
            `${capability.path}/texts/${id(textId)}/copy`,
            copyResponseSchema,
            { accessToken, signal, headers: capability.headers },
            'POST',
            c.CopySharedTextRequestSchema.parse(body),
        );
    },
};
