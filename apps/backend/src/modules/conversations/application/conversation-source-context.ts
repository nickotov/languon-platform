import { createHash } from 'node:crypto';
import type { ConversationSource } from '@languon/contracts';
import type {
    ConversationSourceSnapshot,
    SourceMaterial,
} from '../domain/conversation';

export const initialSourceContextBytes = 12_000;
export const retrievedSourceContextBytes = 24_000;
const excerptContentBytes = 5_500;

const jsonBytes = (value: unknown) =>
    Buffer.byteLength(JSON.stringify(value), 'utf8');
const encodedEmptyStringBytes = jsonBytes(JSON.stringify(''));

function boundedText(
    value: string,
    bytes: number,
    maximumLength = Number.POSITIVE_INFINITY,
) {
    let result = '';
    let size = 0;
    for (const character of value) {
        const next =
            jsonBytes(JSON.stringify(character)) - encodedEmptyStringBytes;
        if (
            size + next > bytes ||
            result.length + character.length > maximumLength
        )
            break;
        result += character;
        size += next;
    }
    return result;
}

/** Split by encoded JSON size, retaining every code point and useful word boundaries. */
function splitContent(content: string): string[] {
    const chunks: string[] = [];
    let pending = '';
    let size = 0;
    for (const character of content) {
        const next = jsonBytes(character) - 2;
        if (size + next > excerptContentBytes) {
            const boundary = Math.max(
                pending.lastIndexOf(' '),
                pending.lastIndexOf('\n'),
            );
            const splitAt =
                boundary > pending.length / 2 ? boundary + 1 : pending.length;
            chunks.push(pending.slice(0, splitAt));
            pending = pending.slice(splitAt);
            size = jsonBytes(pending) - 2;
        }
        pending += character;
        size += next;
    }
    if (pending) chunks.push(pending);
    return chunks;
}

function excerptId(id: string, index: number, content: string) {
    const hash = createHash('sha256')
        .update(`conversation-source-excerpt:${id}:${index}:${content}`)
        .digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function boundedMaterial(
    material: readonly SourceMaterial[],
): SourceMaterial[] {
    return material.flatMap((item) => {
        if (jsonBytes(item) <= 8_000) return [item];
        // Saved sources are already bounded passages. This also handles an
        // explicit unsaved draft or a legacy frozen snapshot without dropping text.
        const chunks = splitContent(item.content);
        return chunks.map((content, index) => ({
            id: excerptId(item.id, index, content),
            kind: 'text' as const,
            label: `${boundedText(item.label, 400, 140)} — excerpt ${index + 1}/${chunks.length}`,
            content,
        }));
    });
}

function rankedIndices(material: readonly SourceMaterial[], query: string) {
    const terms = [
        ...new Set(
            query
                .normalize('NFKC')
                .toLocaleLowerCase()
                .match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [],
        ),
    ]
        .filter((term) => term.length > 1)
        .slice(0, 40);
    const text = material.map((item) =>
        `${item.label}\n${item.content}`.normalize('NFKC').toLocaleLowerCase(),
    );
    const frequencies = terms.map((term) =>
        text.reduce((count, item) => count + Number(item.includes(term)), 0),
    );
    return text
        .map((item, index) => ({
            index,
            score: terms.reduce(
                (score, term, termIndex) =>
                    score +
                    (item.includes(term) ? 1 / frequencies[termIndex]! : 0),
                0,
            ),
        }))
        .sort(
            (left, right) =>
                right.score - left.score || left.index - right.index,
        )
        .map(({ index }) => index);
}

/** Frozen authorized source selection only; live access remains enforced by the worker/store. */
export function projectConversationSource(
    kind: ConversationSource['kind'],
    snapshot: ConversationSourceSnapshot,
    question: string,
) {
    const material = boundedMaterial(snapshot.material);
    function select(
        query: string,
        limit: number,
        fits: (items: SourceMaterial[]) => boolean,
    ) {
        const selected = new Set<number>();
        const maximum = Math.min(
            24,
            Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 5),
        );
        const add = (index: number) => {
            if (
                index < 0 ||
                index >= material.length ||
                selected.has(index) ||
                selected.size >= maximum
            )
                return;
            const candidate = [...selected, index]
                .sort((left, right) => left - right)
                .map((item) => material[item]!);
            if (fits(candidate)) selected.add(index);
        };
        for (const index of rankedIndices(material, query)) {
            add(index);
            if (kind !== 'dictionary') {
                add(index - 1);
                add(index + 1);
            }
            if (selected.size >= maximum) break;
        }
        return [...selected]
            .sort((left, right) => left - right)
            .map((index) => material[index]!);
    }
    const metadata = {
        version: boundedText(snapshot.version, 200),
        title: boundedText(snapshot.title, 800),
        description: snapshot.description
            ? boundedText(snapshot.description, 3_000)
            : null,
        studiedLanguage: boundedText(snapshot.studiedLanguage, 100),
        provenance: snapshot.provenance,
        sourceKind: kind,
        snapshotScope: snapshot.scope ?? 'complete',
        availableMaterialCount: material.length,
    };
    const context = (items: SourceMaterial[]) => ({
        ...metadata,
        scope:
            items.length === material.length &&
            snapshot.scope !== 'selected-material'
                ? 'complete'
                : 'partial',
        includedMaterialCount: items.length,
        ...(kind === 'dictionary' ? {} : { material: items }),
    });
    const initial =
        kind === 'dictionary'
            ? []
            : select(
                  question,
                  24,
                  (items) =>
                      jsonBytes(JSON.stringify(context(items))) <=
                      initialSourceContextBytes,
              );
    return {
        initialContext: context(initial),
        read(input: { query: string; limit: number }) {
            const selected = select(
                input.query,
                input.limit,
                (items) =>
                    jsonBytes({
                        material: items,
                        total: material.length,
                        coverage: 'partial',
                    }) <= retrievedSourceContextBytes,
            );
            // total deliberately describes the whole frozen source, not just
            // lexical matches: returning a few matches is still partial coverage.
            return { material: selected, total: material.length };
        },
    };
}
