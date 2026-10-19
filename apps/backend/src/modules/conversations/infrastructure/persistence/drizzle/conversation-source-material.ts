import { createHash } from 'node:crypto';
import type { KnowledgeBody, TextAlignment } from '@languon/contracts';
import type { SourceMaterial } from '../../../domain/conversation';

/** Budget JSON-escaped UTF-8 rather than UTF-16 units; never split a code point. */
function textChunks(text: string, maxEncodedBytes: number) {
    const result: string[] = [];
    let chunk = '',
        bytes = 0;
    for (const character of text) {
        const size = Buffer.byteLength(JSON.stringify(character), 'utf8') - 2;
        if (chunk && bytes + size > maxEncodedBytes) {
            result.push(chunk);
            chunk = '';
            bytes = 0;
        }
        chunk += character;
        bytes += size;
    }
    if (chunk || !result.length) result.push(chunk);
    return result;
}
function passageId(sourceId: string, version: string, index: number) {
    const namespace = Buffer.from(sourceId.replaceAll('-', ''), 'hex');
    const value = createHash('sha1')
        .update(namespace)
        .update(`${version}:${index}`)
        .digest()
        .subarray(0, 16);
    value[6] = (value[6]! & 0x0f) | 0x50;
    value[8] = (value[8]! & 0x3f) | 0x80;
    const hex = value.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function labelPrefix(title: string, maxLength: number) {
    let label = '';
    for (const character of title) {
        if (label.length + character.length > maxLength) break;
        label += character;
    }
    return label;
}
function passages(
    sourceId: string,
    version: string,
    title: string,
    contents: string[],
): SourceMaterial[] {
    return contents.map((content, index) => ({
        id:
            contents.length === 1
                ? sourceId
                : passageId(sourceId, version, index),
        label:
            contents.length === 1
                ? labelPrefix(title, 200)
                : `${labelPrefix(title, 140)} — passage ${index + 1}/${contents.length}`,
        content,
    }));
}
export function textSourceMaterial(input: {
    id: string;
    version: string;
    title: string;
    sourceText: string;
    sourceLanguage: string;
    targetLanguage: string;
    alignment: TextAlignment | null;
}): SourceMaterial[] {
    const complete = {
        id: input.id,
        label: labelPrefix(input.title, 200),
        content: JSON.stringify({
            sourceText: input.sourceText,
            sourceLanguage: input.sourceLanguage,
            targetLanguage: input.targetLanguage,
            alignment: input.alignment,
        }),
    };
    if (Buffer.byteLength(JSON.stringify(complete), 'utf8') <= 8000)
        return [complete];
    const pairs = input.alignment?.source.map((source, index) => ({
        pairId: source.pairId,
        sourceText: source.text,
        translationText: input.alignment?.translation[index]?.text ?? '',
    })) ?? [
        { pairId: input.id, sourceText: input.sourceText, translationText: '' },
    ];
    const contents = pairs.flatMap((pair) => {
        const source = textChunks(pair.sourceText, 1500),
            translation = textChunks(pair.translationText, 1500);
        const count = Math.max(source.length, translation.length);
        return Array.from({ length: count }, (_, index) =>
            JSON.stringify({
                sourceText:
                    source.length === 1 ? source[0] : (source[index] ?? ''),
                translationText:
                    translation.length === 1
                        ? translation[0]
                        : (translation[index] ?? ''),
                sourceLanguage: input.sourceLanguage,
                targetLanguage: input.targetLanguage,
                pairId: pair.pairId,
                part: index + 1,
                parts: count,
                scope: count === 1 ? 'complete-pair' : 'pair-excerpt',
            }),
        );
    });
    return passages(input.id, input.version, input.title, contents);
}
export function noteSourceMaterial(input: {
    id: string;
    version: string;
    title: string;
    summary: string;
    body: KnowledgeBody;
}): SourceMaterial[] {
    const render = (node: KnowledgeBody['document']): string => {
        if (node.type === 'text') {
            const link = node.marks?.find((mark) => mark.type === 'link');
            return `${node.text ?? ''}${link?.type === 'link' ? ` (${link.attrs.href})` : ''}`;
        }
        const text = (node.content ?? []).map(render).join('');
        return `${text}${['paragraph', 'heading', 'tableCell', 'tableHeader', 'listItem', 'hardBreak'].includes(node.type) ? '\n' : ''}`;
    };
    const text = `${input.title}\n${input.summary}\n\n${render(input.body.document)}`;
    return passages(
        input.id,
        input.version,
        input.title,
        textChunks(text, 6000),
    );
}
