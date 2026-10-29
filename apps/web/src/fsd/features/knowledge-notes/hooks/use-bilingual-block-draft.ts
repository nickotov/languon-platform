'use client';
import { useRef, type RefObject } from 'react';
import type { LearningBlock } from '@languon/contracts';
import type { BlockForm, BlockKind } from '../lib/learning-block-form';
export type BilingualTranslationDraft = Extract<
    LearningBlock,
    { type: 'bilingual-text' }
>['translations'];

/** Switching author languages captures incomplete local values; only explicit Apply validates the whole block. */
export function useBilingualBlockDraft({
    kind,
    block,
    form,
    counts,
    definition,
    onDefinition,
}: {
    kind: BlockKind;
    block?: LearningBlock | undefined;
    form: RefObject<HTMLFormElement | null>;
    counts: RefObject<Record<string, number>>;
    definition: BlockForm;
    onDefinition(next: BlockForm): void;
}) {
    const prepared = useRef<BilingualTranslationDraft>(
        block?.type === 'bilingual-text'
            ? structuredClone(block.translations)
            : [],
    );
    function passages(data: FormData) {
        return Array.from(
            { length: counts.current.segments ?? 0 },
            (_, index) => ({
                id: String(data.get(`segments.${index}.id`) ?? ''),
                text: String(data.get(`segments.${index}.text`) ?? ''),
                translation: String(
                    data.get(`segments.${index}.translation`) ?? '',
                ),
            }),
        );
    }
    function capture(data: FormData) {
        const language = String(data.get('translationLanguage') ?? '').trim();
        const rows = passages(data);
        if (!language) return;
        const existing = prepared.current.find(
            (item) => item.language.toLowerCase() === language.toLowerCase(),
        );
        if (!existing && !rows.some((row) => row.translation.trim())) return;
        const translation = {
            language: existing?.language ?? language,
            segments: rows.map((row) => ({
                sourceSegmentId: row.id,
                text: row.translation,
            })),
        };
        if (existing)
            prepared.current = prepared.current.map((item) =>
                item === existing ? translation : item,
            );
        else prepared.current = [...prepared.current, translation];
    }
    function read(data: FormData) {
        if (kind !== 'bilingual-text') return undefined;
        capture(data);
        return prepared.current;
    }
    function switchLanguage(language: string) {
        if (kind !== 'bilingual-text' || !form.current) return;
        const data = new FormData(form.current);
        capture(data);
        const translation = prepared.current.find(
            (item) => item.language.toLowerCase() === language.toLowerCase(),
        );
        const next: BlockForm = {
            fields: definition.fields.map((field) => ({
                ...field,
                value:
                    field.name === 'translationLanguage'
                        ? language
                        : String(data.get(field.name) ?? field.value ?? ''),
            })),
            groups: definition.groups.map((group) =>
                group.name === 'segments'
                    ? {
                          ...group,
                          rows: passages(data).map((row) => ({
                              id: row.id,
                              text: row.text,
                              translation:
                                  translation?.segments.find(
                                      (item) => item.sourceSegmentId === row.id,
                                  )?.text ?? '',
                          })),
                      }
                    : group,
            ),
        };
        onDefinition(next);
    }
    function needsReview() {
        if (
            block?.type !== 'bilingual-text' ||
            !block.translations.length ||
            !form.current
        )
            return false;
        const rows = passages(new FormData(form.current));
        return (
            rows.length !== block.segments.length ||
            rows.some(
                (row, index) =>
                    row.id !== block.segments[index]?.id ||
                    row.text !== block.segments[index]?.text,
            )
        );
    }
    return {
        read,
        switchLanguage,
        preparedTranslations: prepared.current,
        translationReviewNeeded: needsReview(),
    };
}
