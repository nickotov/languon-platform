import { LearningBlockSchema, type LearningBlock } from '@languon/contracts';
import type { BlockKind } from './block-form-definition';
import type { BlockFormReadContext } from './block-form-read-context';
import {
    readGrammarBlock,
    readVocabularyBlock,
    readBilingualBlock,
} from './read-text-block-form';
import { readVideoBlock, readAudioBlock } from './read-media-block-form';
import { readExerciseBlock } from './read-exercise-block-form';

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
    const context: BlockFormReadContext = {
        data,
        value,
        optional,
        rows,
        common,
        previous,
        preparedDrafts,
    };
    let candidate: unknown;
    if (kind === 'grammar') {
        candidate = readGrammarBlock(context);
    }

    if (kind === 'video') {
        candidate = readVideoBlock(context);
    }

    if (kind === 'vocabulary') {
        candidate = readVocabularyBlock(context);
    }

    if (kind === 'bilingual-text') {
        candidate = readBilingualBlock(context);
    }

    if (kind === 'audio') {
        candidate = readAudioBlock(context);
    }

    if (kind === 'exercise') {
        candidate = readExerciseBlock(context);
    }

    return LearningBlockSchema.parse(candidate);
}
