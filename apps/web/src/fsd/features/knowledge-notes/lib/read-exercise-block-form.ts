import type { BlockFormReadContext } from './block-form-read-context';

export function readExerciseBlock(context: BlockFormReadContext): unknown {
    const { data, value, optional, rows, common, previous } = context;
    const kind = 'exercise';
    let candidate: unknown;

    const old = previous?.type === kind ? previous : undefined;
    let source = old?.source;
    if (data.has('sourceBlockId')) {
        source = undefined;
        const blockId = value('sourceBlockId');
        if (blockId) {
            source = {
                blockId,
                segmentIds: data.getAll('sourceSegmentIds').map(String),
            };
        }
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
            correctChoiceId: choices[Number(value('correctChoice')) - 1]?.id,
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
                          id: oldGaps[gapIndex++]?.id ?? crypto.randomUUID(),
                          acceptedAnswers: part.slice(2, -2).split('|'),
                      }
                    : { kind: 'text', text: part },
            );

        candidate = { ...base, format, parts };
    } else {
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

    return candidate;
}
