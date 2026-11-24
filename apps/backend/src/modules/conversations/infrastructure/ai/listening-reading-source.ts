import type { LearningContentBrief } from '../../application/learning-content-contract';
import type { GeneratedReading } from '../../application/ports/tutor-runner';

const copy = {
    en: {
        choose: 'Which reading should the dialogue discuss?',
        unavailable:
            'Select a passage or reference a reading in this conversation.',
        tooLong: 'This reading is too long. Select a shorter passage.',
    },
    ru: {
        choose: 'Какой текст должны обсудить собеседники?',
        unavailable: 'Выделите отрывок или укажите текст из этого чата.',
        tooLong: 'Этот текст слишком длинный. Выделите отрывок покороче.',
    },
    fr: {
        choose: 'De quel texte le dialogue doit-il parler ?',
        unavailable:
            'Sélectionnez un passage ou indiquez un texte de cette conversation.',
        tooLong: 'Ce texte est trop long. Sélectionnez un passage plus court.',
    },
    es: {
        choose: '¿Sobre qué texto debe tratar el diálogo?',
        unavailable:
            'Selecciona un fragmento o indica un texto de esta conversación.',
        tooLong:
            'El texto es demasiado largo. Selecciona un fragmento más corto.',
    },
} as const;

export async function resolveListeningReading(input: {
    brief: LearningContentBrief;
    selection?: string | undefined;
    referencedBlocks: string[];
    replyLanguage: string;
    message: string;
    matchedTitle?: string | undefined;
    selectedKey?: string | undefined;
    read?: (() => Promise<GeneratedReading[]>) | undefined;
}) {
    const messages =
        copy[
            input.replyLanguage.toLowerCase().split('-')[0] as keyof typeof copy
        ] ?? copy.en;
    let needsReading = false;
    const tasks = input.brief.tasks.map((task) => {
        if (task.kind !== 'audio' || task.source?.kind === 'task') {
            return task;
        }

        if (
            !input.selectedKey &&
            (input.selection || input.referencedBlocks.length)
        ) {
            const { sourceText: _modelText, ...requirements } = task;

            return {
                ...requirements,
                source: input.selection
                    ? { kind: 'selection' as const }
                    : { kind: 'editor' as const },
            };
        }

        if (
            task.source?.kind === 'generated-reading' ||
            task.source?.kind === 'selection'
        ) {
            needsReading = true;

            return { ...task, source: { kind: 'generated-reading' as const } };
        }

        return task;
    });

    if (!needsReading) {
        return { brief: { ...input.brief, tasks } };
    }

    const readings = (await input.read?.()) ?? [];
    const normalized = (s: string) => s.normalize('NFKC').toLowerCase();
    const message = normalized(input.message);
    const matchedTitle = input.matchedTitle
        ? normalized(input.matchedTitle)
        : undefined;
    const titleMatches = readings.filter((reading) => {
        const title = normalized(reading.title);
        return (
            message === title ||
            (matchedTitle === title && message.includes(title))
        );
    });
    const selected = input.selectedKey
        ? readings.find((r) => r.key === input.selectedKey)
        : titleMatches.length === 1
          ? titleMatches[0]
          : readings.length === 1
            ? readings[0]
            : undefined;

    if (!selected) {
        if (!readings.length || (input.selectedKey && readings.length === 1)) {
            return { question: messages.unavailable };
        }

        const hasRepeatedTitles =
            new Set(readings.map((r) => normalized(r.title))).size <
            readings.length;
        const choices = readings.map((r, i) => ({
            key: r.key,
            label: hasRepeatedTitles ? `${i + 1}. ${r.title}` : r.title,
        }));

        return { question: messages.choose, choices };
    }

    if (selected.text.length > 40_000) {
        return { question: messages.tooLong };
    }

    return {
        brief: {
            ...input.brief,
            tasks: tasks.map((task) => {
                if (task.source?.kind !== 'generated-reading') {
                    return task;
                }

                const { source: _selector, ...requirements } = task;

                // Only canonical, lease-authorized prose reaches the frozen audio task.
                return { ...requirements, sourceText: selected.text };
            }),
        },
    };
}
