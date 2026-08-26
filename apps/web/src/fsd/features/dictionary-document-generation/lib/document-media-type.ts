import type { CreateDictionaryDocumentUploadRequest } from '@languon/contracts';

type DocumentMediaType = CreateDictionaryDocumentUploadRequest['mediaType'];

const MEDIA_TYPE_BY_EXTENSION: Readonly<Record<string, DocumentMediaType>> = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    markdown: 'text/markdown',
    md: 'text/markdown',
    pdf: 'application/pdf',
    png: 'image/png',
    txt: 'text/plain',
    webp: 'image/webp',
};

const DOCUMENT_MEDIA_TYPES = new Set<DocumentMediaType>(
    Object.values(MEDIA_TYPE_BY_EXTENSION),
);

export function documentMediaTypeForFile(
    file: Pick<File, 'name' | 'type'>,
): DocumentMediaType | null {
    const extension = file.name.split('.').pop()?.toLocaleLowerCase('en');
    const extensionType = extension
        ? MEDIA_TYPE_BY_EXTENSION[extension]
        : undefined;
    const declaredType = DOCUMENT_MEDIA_TYPES.has(
        file.type as DocumentMediaType,
    )
        ? (file.type as DocumentMediaType)
        : undefined;

    if (declaredType && extensionType && declaredType !== extensionType) {
        return null;
    }
    return declaredType ?? extensionType ?? null;
}
