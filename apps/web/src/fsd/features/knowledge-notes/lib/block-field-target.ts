import {
    KnowledgeBlockFieldTargetSchema,
    type KnowledgeBlockFieldTarget,
} from '@languon/contracts';
import type { BlockKind } from './learning-block-form';

/** An allowlist maps form controls to typed AI fields; arbitrary JSON paths are never sent. */
export function blockFieldTarget(
    kind: BlockKind,
    name: string,
    currentValue: string,
    data: FormData,
): KnowledgeBlockFieldTarget | null {
    const read = (key: string) => String(data.get(key) ?? '');
    const common = {
        sourceLanguage: read('language'),
        targetLanguage: read('translationLanguage'),
        currentValue,
    };
    let candidate: unknown;
    const entry = /^entries\.(\d+)\.(translation|exampleTranslation)$/u.exec(
        name,
    );
    if (kind === 'vocabulary' && entry) {
        const field = entry[2];
        candidate = {
            ...common,
            kind,
            entryId: read(`entries.${entry[1]}.id`),
            field,
            sourceText: read(
                `entries.${entry[1]}.${field === 'translation' ? 'term' : 'example'}`,
            ),
        };
    }
    const segment = /^segments\.(\d+)\.translation$/u.exec(name);
    if (kind === 'bilingual-text' && segment)
        candidate = {
            ...common,
            kind,
            segmentId: read(`segments.${segment[1]}.id`),
            sourceText: read(`segments.${segment[1]}.text`),
        };
    const parsed = KnowledgeBlockFieldTargetSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
}
