import {
    LearningMediaUrlSchema,
    LearningBlockSchema,
    type LearningBlock,
} from '@languon/contracts';

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
    if (kind !== 'exercise')
        fields.push(
            field(
                'language',
                'Content language',
                (block && 'language' in block ? block.language : undefined) ??
                    defaults?.content ??
                    'en',
            ),
        );
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
        if (languageField)
            languageField.value =
                video?.transcript?.language ?? defaults?.content ?? 'en';
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
        if (languageField)
            languageField.value =
                audio?.language ??
                audio?.transcript?.language ??
                defaults?.content ??
                'en';
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

export function readBlockForm(
    kind: BlockKind,
    data: FormData,
    counts: Record<string, number>,
    previous?: LearningBlock,
    preparedDrafts?: Extract<
        LearningBlock,
        { type: 'bilingual-text' }
    >['translations'],
): LearningBlock {
    const value = (name: string) => String(data.get(name) ?? '');
    const optional = (name: string) => value(name).trim() || undefined;
    const rows = (name: string, names: string[]) =>
        Array.from({ length: counts[name] ?? 0 }, (_, index) =>
            Object.fromEntries(
                names.map((key) => [key, value(`${name}.${index}.${key}`)]),
            ),
        ).filter((row) => Object.values(row).some((text) => text.trim()));
    const common = {
        id: previous?.id ?? (value('blockId') || crypto.randomUUID()),
        ...(optional('title') ? { title: optional('title') } : {}),
    };
    let candidate: unknown;
    if (kind === 'grammar') {
        const examples = rows('examples', ['text', 'translation']).map(
            (row) => ({
                text: row.text,
                ...(row.translation ? { translation: row.translation } : {}),
            }),
        );
        const mistakes = rows('mistakes', [
            'incorrect',
            'correct',
            'explanation',
        ]).map((row) => ({
            incorrect: row.incorrect,
            correct: row.correct,
            ...(row.explanation ? { explanation: row.explanation } : {}),
        }));
        candidate = {
            ...common,
            type: kind,
            language: value('language'),
            ...(optional('rule') ? { rule: value('rule') } : {}),
            ...(optional('pattern') ? { pattern: value('pattern') } : {}),
            ...(examples.length ? { examples } : {}),
            ...(mistakes.length ? { commonMistakes: mistakes } : {}),
        };
    }
    if (kind === 'video') {
        const url = new URL(LearningMediaUrlSchema.parse(value('video')));
        let videoId: string | null = null;
        if (
            ['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(
                url.hostname,
            )
        )
            videoId = url.searchParams.get('v');
        if (url.hostname === 'youtu.be') videoId = url.pathname.slice(1);
        if (
            [
                'www.youtube.com',
                'youtube.com',
                'm.youtube.com',
                'www.youtube-nocookie.com',
            ].includes(url.hostname)
        ) {
            const embedded =
                /^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/u.exec(
                    url.pathname,
                );
            if (embedded) videoId = embedded[1] ?? null;
        }
        const previousTranscript =
            previous?.type === 'video' ? previous.transcript : undefined;
        const passages = rows('transcript', ['id', 'text', 'start', 'end']);
        candidate = {
            ...common,
            type: kind,
            ...(optional('description')
                ? { description: value('description') }
                : {}),
            source: videoId
                ? { kind: 'youtube', videoId }
                : { kind: 'url', url: value('video') },
            ...(passages.length
                ? {
                      transcript: {
                          language: value('language'),
                          segments: passages.map((row, index) => ({
                              id:
                                  row.id ||
                                  previousTranscript?.segments[index]?.id ||
                                  crypto.randomUUID(),
                              text: row.text,
                              ...(row.start || row.end
                                  ? {
                                        timing: {
                                            startSeconds: Number(row.start),
                                            endSeconds: Number(row.end),
                                        },
                                    }
                                  : {}),
                          })),
                      },
                  }
                : {}),
        };
    }
    if (kind === 'vocabulary') {
        const old = previous?.type === kind ? previous : undefined;
        candidate = {
            ...common,
            type: kind,
            language: value('language'),
            translationLanguage: value('translationLanguage'),
            entries: rows('entries', [
                'id',
                'term',
                'translation',
                'pronunciation',
                'definition',
                'example',
                'exampleTranslation',
            ]).map((row, index) => ({
                id: row.id || old?.entries[index]?.id || crypto.randomUUID(),
                term: row.term,
                translation: row.translation,
                ...(row.definition ? { definition: row.definition } : {}),
                ...(row.pronunciation
                    ? { pronunciation: row.pronunciation }
                    : {}),
                ...(row.example ? { example: row.example } : {}),
                ...(row.exampleTranslation
                    ? { exampleTranslation: row.exampleTranslation }
                    : {}),
            })),
        };
    }
    if (kind === 'bilingual-text') {
        const old = previous?.type === kind ? previous : undefined;
        const passages = rows('segments', ['id', 'text', 'translation']);
        const segments = passages.map((row, index) => ({
            id: row.id || old?.segments[index]?.id || crypto.randomUUID(),
            text: row.text,
        }));
        const translated = passages.some((row) => row.translation?.trim());
        const editedLanguage = value('translationLanguage');
        const prior = preparedDrafts ?? old?.translations ?? [];
        const translations = prior.map((translation) => ({
            language: translation.language,
            segments: segments.map((segment) => ({
                sourceSegmentId: segment.id,
                text:
                    translation.segments.find(
                        (item) => item.sourceSegmentId === segment.id,
                    )?.text ?? '',
            })),
        }));
        const index = translations.findIndex(
            (translation) =>
                translation.language.toLowerCase() ===
                editedLanguage.toLowerCase(),
        );
        const replacement = {
            language:
                index >= 0 ? translations[index]!.language : editedLanguage,
            segments: passages.map((row, index) => ({
                sourceSegmentId: segments[index]!.id,
                text: row.translation ?? '',
            })),
        };
        if (index >= 0) translations[index] = replacement;
        else if (translated) translations.push(replacement);
        candidate = {
            ...common,
            type: kind,
            language: value('language'),
            segments,
            translations,
        };
    }
    if (kind === 'audio') {
        const audio = previous?.type === 'audio' ? previous : undefined;
        const passages = rows('transcript', ['id', 'text', 'start', 'end']);
        candidate = {
            ...common,
            type: kind,
            language: value('language'),
            ...(audio?.assetId ? { assetId: audio.assetId } : {}),
            ...(optional('sourceText')
                ? { sourceText: value('sourceText') }
                : {}),
            ...(passages.length
                ? {
                      transcript: {
                          language:
                              audio?.transcript &&
                              value('language') ===
                                  (audio.language ?? audio.transcript.language)
                                  ? audio.transcript.language
                                  : value('language'),
                          segments: passages.map((row, index) => ({
                              id:
                                  row.id ||
                                  audio?.transcript?.segments[index]?.id ||
                                  crypto.randomUUID(),
                              text: row.text,
                              ...(row.start || row.end
                                  ? {
                                        timing: {
                                            startSeconds: Number(row.start),
                                            endSeconds: Number(row.end),
                                        },
                                    }
                                  : {}),
                          })),
                      },
                  }
                : {}),
        };
    }
    if (kind === 'exercise') {
        const old = previous?.type === kind ? previous : undefined;
        let source = old?.source;
        if (data.has('sourceBlockId')) {
            source = undefined;
            const blockId = value('sourceBlockId');
            if (blockId)
                source = {
                    blockId,
                    segmentIds: data.getAll('sourceSegmentIds').map(String),
                };
        }
        const base = {
            ...common,
            type: kind,
            question: value('question'),
            ...(old?.group ? { group: old.group } : {}),
            ...(optional('hint') ? { hint: value('hint') } : {}),
            referenceAnswer: value('referenceAnswer'),
            explanation: value('explanation'),
            ...(optional('evaluationCriteria')
                ? { evaluationCriteria: value('evaluationCriteria') }
                : {}),
            ...(source ? { source } : {}),
        };
        const format = value('format');
        if (format === 'multiple-choice') {
            const choices = rows('choices', ['text']).map((row, index) => ({
                id:
                    old?.format === format
                        ? (old.choices[index]?.id ?? crypto.randomUUID())
                        : crypto.randomUUID(),
                text: row.text,
            }));
            candidate = {
                ...base,
                format,
                choices,
                correctChoiceId:
                    choices[Number(value('correctChoice')) - 1]?.id,
            };
        } else if (format === 'fill-in-the-blank') {
            const oldGaps =
                old?.format === format
                    ? old.parts.filter((part) => part.kind === 'gap')
                    : [];
            let gapIndex = 0;
            const parts = value('gapText')
                .split(/(\[\[[^\]]+\]\])/u)
                .filter(Boolean)
                .map((part) =>
                    part.startsWith('[[')
                        ? {
                              kind: 'gap',
                              id:
                                  oldGaps[gapIndex++]?.id ??
                                  crypto.randomUUID(),
                              acceptedAnswers: part.slice(2, -2).split('|'),
                          }
                        : { kind: 'text', text: part },
                );
            candidate = { ...base, format, parts };
        } else
            candidate = {
                ...base,
                format,
                ...(optional('acceptedAnswers')
                    ? {
                          acceptedAnswers: value('acceptedAnswers')
                              .split('\n')
                              .filter((answer) => answer.trim()),
                      }
                    : {}),
            };
    }
    return LearningBlockSchema.parse(candidate);
}
