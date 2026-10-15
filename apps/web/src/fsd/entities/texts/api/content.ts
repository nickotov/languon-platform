import * as c from '@languon/contracts';
import { id, query, request } from './transport';

type Query = Partial<c.ListTextsQuery>;
type Version = ReturnType<typeof c.TextVersionRequestSchema.parse>;
export const contentApi = {
    listFolders: (
        accessToken: string,
        values: Query = {},
        signal?: AbortSignal,
    ) =>
        request(
            `/text-folders${query(values)}`,
            c.ListTextFoldersResponseSchema,
            { accessToken, signal },
        ),
    createFolder: (
        accessToken: string,
        body: c.CreateTextFolderRequest,
        signal?: AbortSignal,
    ) =>
        request(
            '/text-folders',
            c.TextFolderResponseSchema,
            { accessToken, signal },
            'POST',
            c.CreateTextFolderRequestSchema.parse(body),
        ),
    updateFolder: (
        accessToken: string,
        folderId: string,
        body: c.UpdateTextFolderRequest,
        signal?: AbortSignal,
    ) =>
        request(
            `/text-folders/${id(folderId)}`,
            c.TextFolderResponseSchema,
            { accessToken, signal },
            'PATCH',
            c.UpdateTextFolderRequestSchema.parse(body),
        ),
    archiveFolder: (
        accessToken: string,
        folderId: string,
        body: Version,
        signal?: AbortSignal,
    ) =>
        request(
            `/text-folders/${id(folderId)}/archive`,
            c.TextFolderResponseSchema,
            { accessToken, signal },
            'POST',
            c.TextVersionRequestSchema.parse(body),
        ),
    restoreFolder: (
        accessToken: string,
        folderId: string,
        body: Version,
        signal?: AbortSignal,
    ) =>
        request(
            `/text-folders/${id(folderId)}/restore`,
            c.TextFolderResponseSchema,
            { accessToken, signal },
            'POST',
            c.TextVersionRequestSchema.parse(body),
        ),
    listTexts: (
        accessToken: string,
        folderId: string,
        values: Query = {},
        signal?: AbortSignal,
    ) =>
        request(
            `/text-folders/${id(folderId)}/texts${query(values)}`,
            c.ListTextsResponseSchema,
            { accessToken, signal },
        ),
    getText: (accessToken: string, textId: string, signal?: AbortSignal) =>
        request(`/texts/${id(textId)}`, c.TextResponseSchema, {
            accessToken,
            signal,
        }),
    createText: (
        accessToken: string,
        body: c.CreateTextRequest,
        signal?: AbortSignal,
    ) =>
        request(
            '/texts',
            c.TextResponseSchema,
            { accessToken, signal },
            'POST',
            c.CreateTextRequestSchema.parse(body),
        ),
    saveText: (
        accessToken: string,
        textId: string,
        body: c.SaveTextRequest,
        signal?: AbortSignal,
    ) =>
        request(
            `/texts/${id(textId)}`,
            c.TextResponseSchema,
            { accessToken, signal },
            'PUT',
            c.SaveTextRequestSchema.parse(body),
        ),
    archiveText: (
        accessToken: string,
        textId: string,
        body: Version,
        signal?: AbortSignal,
    ) =>
        request(
            `/texts/${id(textId)}/archive`,
            c.TextResponseSchema,
            { accessToken, signal },
            'POST',
            c.TextVersionRequestSchema.parse(body),
        ),
    restoreText: (
        accessToken: string,
        textId: string,
        body: Version,
        signal?: AbortSignal,
    ) =>
        request(
            `/texts/${id(textId)}/restore`,
            c.TextResponseSchema,
            { accessToken, signal },
            'POST',
            c.TextVersionRequestSchema.parse(body),
        ),
};
