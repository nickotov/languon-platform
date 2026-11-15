import { exerciseActivityCatalog } from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
import type { Basic } from './editor-basic-command';
import type { BlockKind } from './learning-block-form';
import type { BlockAuthoringLabels } from '../ui/learning-block-authoring/block-labels';

const learningKinds: BlockKind[] = [
    'bilingual-text',
    'vocabulary',
    'grammar',
    'audio',
    'video',
];

export function editorCommandResults({
    query,
    locale,
    basic,
    basicLabel,
    labels,
}: {
    query: string;
    locale: Locale;
    basic: Basic[];
    basicLabel(kind: Basic): string;
    labels: BlockAuthoringLabels;
}) {
    const normalized = query.trim().toLocaleLowerCase(locale);
    const matches = (value: string) =>
        value.toLocaleLowerCase(locale).includes(normalized);
    const basicMatches = basic.filter((kind) => matches(basicLabel(kind)));
    const learningMatches = learningKinds.filter((kind) =>
        matches(labels.view.kinds[kind]),
    );
    const activityMatches = exerciseActivityCatalog.some((activity) => {
        const display = activity.locales[locale];

        return matches(`${activity.id} ${display.name} ${display.description}`);
    });

    return { normalized, basicMatches, learningMatches, activityMatches };
}
