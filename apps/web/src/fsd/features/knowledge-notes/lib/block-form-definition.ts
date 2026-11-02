import type { LearningBlock } from '@languon/contracts';

export type BlockKind = LearningBlock['type'];
export type BlockLanguageDefaults = {
    content?: string | undefined;
    translation?: string | undefined;
};
export type BlockField = {
    name: string;
    label: string;
    multiline?: boolean;
    value?: string;
};
export type BlockGroup = {
    name: string;
    label: string;
    fields: BlockField[];
    rows: Record<string, string>[];
};
export type BlockForm = { fields: BlockField[]; groups: BlockGroup[] };
const field = (
    name: string,
    label: string,
    value = '',
    multiline = false,
): BlockField => ({ name, label, value, multiline });

/** Authoring controls describe content, never executable markup or storage keys. */
export function blockForm(
    kind: BlockKind,
    block?: LearningBlock,
    defaults?: BlockLanguageDefaults,
): BlockForm {
    const fields = [field('title', 'Title', block?.title)];
    const groups: BlockGroup[] = [];
    if (kind !== 'exercise') {
        fields.push(
            field(
                'language',
                'Content language',
                (block && 'language' in block ? block.language : undefined) ??
                    defaults?.content ??
                    'en',
            ),
        );
    }

    if (kind === 'video') {
        const video = block?.type === 'video' ? block : undefined;
        const source = video?.source;
        fields.push(
            field(
                'video',
                'YouTube link or HTTPS video URL',
                source?.kind === 'youtube'
                    ? `https://www.youtube.com/watch?v=${source.videoId}`
                    : source?.url,
            ),
        );

        fields.push(
            field(
                'description',
                'Author’s description',
                video?.description,
                true,
            ),
        );

        const languageField = fields.find((item) => item.name === 'language');
        if (languageField) {
            languageField.value =
                video?.transcript?.language ?? defaults?.content ?? 'en';
        }

        groups.push({
            name: 'transcript',
            label: 'Transcript passages',
            fields: [
                field('text', 'Transcript', '', true),
                field('start', 'Start seconds (optional)'),
                field('end', 'End seconds (optional)'),
            ],
            rows:
                video?.transcript?.segments.map((segment) => ({
                    id: segment.id,
                    text: segment.text,
                    start: segment.timing
                        ? String(segment.timing.startSeconds)
                        : '',
                    end: segment.timing
                        ? String(segment.timing.endSeconds)
                        : '',
                })) ?? [],
        });
    }

    if (kind === 'grammar') {
        const grammar = block?.type === 'grammar' ? block : undefined;
        fields.push(
            field('rule', 'Rule', grammar?.rule, true),
            field('pattern', 'Formation / pattern', grammar?.pattern, true),
        );

        groups.push({
            name: 'examples',
            label: 'Examples',
            fields: [
                field('text', 'Example'),
                field('translation', 'Translation'),
            ],
            rows:
                grammar?.examples?.map((row) => ({
                    ...row,
                    translation: row.translation ?? '',
                })) ?? [],
        });

        groups.push({
            name: 'mistakes',
            label: 'Common mistakes',
            fields: [
                field('incorrect', 'Incorrect'),
                field('correct', 'Correct'),
                field('explanation', 'Why'),
            ],
            rows:
                grammar?.commonMistakes?.map((row) => ({
                    ...row,
                    explanation: row.explanation ?? '',
                })) ?? [],
        });
    }

    if (kind === 'vocabulary') {
        const vocabulary = block?.type === 'vocabulary' ? block : undefined;
        fields.push(
            field(
                'translationLanguage',
                'Translation language',
                vocabulary?.translationLanguage ??
                    defaults?.translation ??
                    'en',
            ),
        );

        groups.push({
            name: 'entries',
            label: 'Vocabulary entries',
            fields: [
                field('term', 'Word or phrase'),
                field('translation', 'Translation'),
                field('pronunciation', 'Pronunciation'),
                field('definition', 'Definition', '', true),
                field('example', 'Example'),
                field('exampleTranslation', 'Example translation'),
            ],
            rows: vocabulary?.entries.map((entry) => ({
                ...entry,
                pronunciation: entry.pronunciation ?? '',
                definition: entry.definition ?? '',
                example: entry.example ?? '',
                exampleTranslation: entry.exampleTranslation ?? '',
            })) ?? [{}],
        });
    }

    if (kind === 'bilingual-text') {
        const bilingual = block?.type === 'bilingual-text' ? block : undefined;
        const translation = bilingual?.translations[0];
        fields.push(
            field(
                'translationLanguage',
                'Translation language',
                translation?.language ?? defaults?.translation ?? 'en',
            ),
        );

        groups.push({
            name: 'segments',
            label: 'Aligned passages',
            fields: [
                field('text', 'Original passage', '', true),
                field('translation', 'Translated passage', '', true),
            ],
            rows: bilingual?.segments.map((segment) => ({
                id: segment.id,
                text: segment.text,
                translation:
                    translation?.segments.find(
                        (item) => item.sourceSegmentId === segment.id,
                    )?.text ?? '',
            })) ?? [{}],
        });
    }

    if (kind === 'audio') {
        const audio = block?.type === 'audio' ? block : undefined;
        fields.push(
            field('sourceText', 'Speech source text', audio?.sourceText, true),
        );

        groups.push({
            name: 'transcript',
            label: 'Transcript passages',
            fields: [
                field('text', 'Transcript', '', true),
                field('start', 'Start seconds (optional)'),
                field('end', 'End seconds (optional)'),
            ],
            rows:
                audio?.transcript?.segments.map((segment) => ({
                    id: segment.id,
                    text: segment.text,
                    start: segment.timing
                        ? String(segment.timing.startSeconds)
                        : '',
                    end: segment.timing
                        ? String(segment.timing.endSeconds)
                        : '',
                })) ?? [],
        });

        const languageField = fields.find((item) => item.name === 'language');
        if (languageField) {
            languageField.value =
                audio?.language ??
                audio?.transcript?.language ??
                defaults?.content ??
                'en';
        }
    }

    if (kind === 'exercise') {
        const exercise = block?.type === 'exercise' ? block : undefined;
        fields.push(
            field('question', 'Question', exercise?.question, true),
            field('hint', 'Hint', exercise?.hint, true),
            field(
                'referenceAnswer',
                'Reference answer',
                exercise?.referenceAnswer,
                true,
            ),
            field(
                'explanation',
                'Why the answer is correct',
                exercise?.explanation,
                true,
            ),
            field(
                'evaluationCriteria',
                'Evaluation guidance (optional)',
                exercise?.evaluationCriteria,
                true,
            ),
        );

        fields.push(
            field('format', 'Answer format', exercise?.format ?? 'free-text'),
        );

        groups.push({
            name: 'choices',
            label: 'Multiple-choice answers',
            fields: [field('text', 'Choice')],
            rows:
                exercise?.format === 'multiple-choice'
                    ? exercise.choices
                    : [{}, {}],
        });

        fields.push(
            field(
                'correctChoice',
                'Correct choice number',
                exercise?.format === 'multiple-choice'
                    ? String(
                          exercise.choices.findIndex(
                              (choice) =>
                                  choice.id === exercise.correctChoiceId,
                          ) + 1,
                      )
                    : '1',
            ),
        );

        const gapText =
            exercise?.format === 'fill-in-the-blank'
                ? exercise.parts
                      .map((part) =>
                          part.kind === 'text'
                              ? part.text
                              : `[[${part.acceptedAnswers.join('|')}]]`,
                      )
                      .join('')
                : '';

        fields.push(
            field(
                'gapText',
                'Gap text — enclose answers in [[answer|alternative]]',
                gapText,
                true,
            ),
        );

        fields.push(
            field(
                'acceptedAnswers',
                'Other accepted answers (one per line)',
                exercise?.format === 'free-text'
                    ? exercise.acceptedAnswers?.join('\n')
                    : '',
                true,
            ),
        );
    }

    return { fields, groups };
}
