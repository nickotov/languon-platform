import { randomUUID } from 'node:crypto';
import { LearningBlockSchema, type LearningBlock } from '@languon/contracts';

type Identified = { id: string };

/** Existing IDs win; unique unchanged semantic content recovers incidental model UUID churn. */
function reconcileItems<T extends Identified>(
    original: readonly T[],
    candidate: readonly T[],
    semanticKey: (item: T) => string,
    ids: Map<string, string>,
): T[] {
    const claimed = new Set<string>();

    return candidate.map((item) => {
        const explicit = original.find((old) => old.id === item.id);
        const semantic = original.filter(
            (old) => semanticKey(old) === semanticKey(item),
        );
        const old =
            explicit ?? (semantic.length === 1 ? semantic[0] : undefined);

        if (!old && semantic.length > 1) {
            throw new Error(
                'Repeated unchanged items require their existing identities.',
            );
        }

        if (old && claimed.has(old.id)) {
            throw new Error(
                'A revision cannot duplicate an existing item identity.',
            );
        }

        const id = old?.id ?? randomUUID();
        if (ids.has(item.id) && ids.get(item.id) !== id) {
            throw new Error(
                'Candidate item identities must be unique across the revision.',
            );
        }

        claimed.add(id);
        ids.set(item.id, id);

        return { ...item, id };
    });
}

/** Host-owned reconciliation matches current editor semantics without positional guesses. */
export function reconcileLearningBlockRevision(
    source: LearningBlock,
    candidate: LearningBlock,
    ids = new Map<string, string>(),
): LearningBlock {
    if (source.type !== candidate.type || source.id !== candidate.id) {
        throw new Error('A revision must preserve its exact target and type.');
    }

    let revised: LearningBlock = candidate;
    if (source.type === 'vocabulary' && candidate.type === 'vocabulary') {
        revised = {
            ...candidate,
            entries: reconcileItems(
                source.entries,
                candidate.entries,
                (entry) => entry.term.normalize('NFKC'),
                ids,
            ),
        };
    } else if (
        source.type === 'bilingual-text' &&
        candidate.type === 'bilingual-text'
    ) {
        revised = {
            ...candidate,
            segments: reconcileItems(
                source.segments,
                candidate.segments,
                (segment) => segment.text,
                ids,
            ),
        };
    } else if (
        (source.type === 'audio' || source.type === 'video') &&
        (candidate.type === 'audio' || candidate.type === 'video')
    ) {
        if (candidate.transcript) {
            revised = {
                ...candidate,
                transcript: {
                    ...candidate.transcript,
                    segments: reconcileItems(
                        source.transcript?.segments ?? [],
                        candidate.transcript.segments,
                        (segment) => segment.text,
                        ids,
                    ),
                },
            };
        }
    } else if (source.type === 'exercise' && candidate.type === 'exercise') {
        let group = candidate.group;
        if (group) {
            const id = source.group?.id ?? ids.get(group.id) ?? randomUUID();
            ids.set(group.id, id);
            group = { ...group, id };
        }

        revised = { ...candidate, ...(group ? { group } : {}) };
        if (candidate.format === 'multiple-choice') {
            revised = {
                ...candidate,
                ...(group ? { group } : {}),
                choices: reconcileItems(
                    source.format === 'multiple-choice' ? source.choices : [],
                    candidate.choices,
                    (choice) => choice.text,
                    ids,
                ),
            };
        } else if (candidate.format === 'fill-in-the-blank') {
            const gaps = reconcileItems(
                source.format === 'fill-in-the-blank'
                    ? source.parts.filter((part) => part.kind === 'gap')
                    : [],
                candidate.parts.filter((part) => part.kind === 'gap'),
                (gap) => JSON.stringify(gap.acceptedAnswers),
                ids,
            );
            let index = 0;
            revised = {
                ...candidate,
                ...(group ? { group } : {}),
                parts: candidate.parts.map((part) =>
                    part.kind === 'gap' ? gaps[index++]! : part,
                ),
            };
        }
    }

    return LearningBlockSchema.parse(remapReferences(revised, ids));
}

// References follow recovered identities; removed-item references fail canonical
// validators instead of accidentally binding to another item.
function remapReferences(
    value: unknown,
    ids: ReadonlyMap<string, string>,
    key?: string,
): unknown {
    if (Array.isArray(value)) {
        return value.map((child) => remapReferences(child, ids, key));
    }

    if (
        typeof value === 'string' &&
        key &&
        ['sourceSegmentId', 'segmentIds', 'correctChoiceId'].includes(key)
    ) {
        return ids.get(value) ?? value;
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value).map(([name, child]) => [
            name,
            remapReferences(child, ids, name),
        ]),
    );
}

/** Reconcile a complete selected set before checking references or publishing any target. */
export function reconcileLearningBlockRevisions(
    sources: readonly LearningBlock[],
    candidates: readonly LearningBlock[],
): LearningBlock[] {
    const ids = new Map<string, string>();
    const revised = candidates.map((candidate) => {
        const source = sources.find((item) => item.id === candidate.id);
        if (!source) {
            throw new Error('A revision must use an authorized target.');
        }

        return reconcileLearningBlockRevision(source, candidate, ids);
    });
    const blocks = LearningBlockSchema.array().parse(
        remapReferences(revised, ids),
    );

    for (const block of blocks) {
        if (block.type !== 'exercise' || !block.source) {
            continue;
        }

        const target = blocks.find((item) => item.id === block.source!.blockId);
        if (!target) {
            const original = sources.find((item) => item.id === block.id);
            if (
                original?.type !== 'exercise' ||
                JSON.stringify(original.source) !== JSON.stringify(block.source)
            ) {
                throw new Error(
                    'A revision cannot invent an unselected source reference.',
                );
            }

            continue;
        }

        const segments =
            target.type === 'bilingual-text'
                ? target.segments
                : target.type === 'audio' || target.type === 'video'
                  ? target.transcript?.segments
                  : undefined;

        if (
            !segments ||
            block.source.segmentIds.some(
                (id) => !segments.some((segment) => segment.id === id),
            )
        ) {
            throw new Error('A revision references a removed source segment.');
        }
    }

    return blocks;
}
