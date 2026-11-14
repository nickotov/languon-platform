'use client';

import { useState } from 'react';
import { LearningBlockView } from '@/fsd/entities/learning-blocks';
import type { Locale } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import type { GuideActivity } from '../../lib/examples';
import { guideCopy } from '../../lib/content';
import { guideUiCopy } from '../copy';
import { guideBlockLabels } from '../labels';
import { PromptRecipe } from '../prompt-recipe/prompt-recipe';
import { SampleFeedback } from '../sample-feedback/sample-feedback';
import { ActivitySelector } from '../activity-selector/activity-selector';
import styles from './exercise-explorer.module.css';

export function ExerciseExplorer({
    locale,
    activities,
    initialActivity,
}: {
    locale: Locale;
    activities: GuideActivity[];
    initialActivity?: string | undefined;
}) {
    const initial =
        activities.find((item) => item.activity.id === initialActivity) ??
        activities.find((item) => item.activity.id === 'V02') ??
        activities[0]!;
    const [selected, setSelected] = useState(initial.activity.id);
    const [revision, setRevision] = useState(0);
    const current =
        activities.find((item) => item.activity.id === selected) ?? initial;
    const copy = guideUiCopy(locale);
    const labels = guideBlockLabels(locale);
    const content = guideCopy(locale);
    const metadata = current.activity.locales[locale];
    const isTranslation = selected === 'W01';
    const policy = current.block.semantics!.checking.policy;
    let checkingLabel = copy.prepared;
    if (policy === 'hybrid') {
        checkingLabel = copy.hybrid;
    }

    if (policy === 'ai-rubric') {
        checkingLabel = copy.rubric;
    }

    const demoKey = `${selected}-${revision}`;
    const expansion = { open: true, at: revision };
    const promptText = `${current.prompt}\n\n${current.sourceText}`;
    const otherRecipes = content.recipes.filter(
        (recipe) => recipe.id !== 'specific',
    );

    function handleSelect(activityId: string) {
        const activity = activities.find(
            (item) => item.activity.id === activityId,
        );

        if (!activity) {
            return;
        }

        setSelected(activity.activity.id);
        setRevision(0);
        const url = new URL(window.location.href);
        url.searchParams.set('activity', activity.activity.id);
        window.history.replaceState(null, '', url);
    }

    function handleReset() {
        setRevision((value) => value + 1);
    }

    return (
        <div className={styles.root}>
            <ActivitySelector
                locale={locale}
                activities={activities}
                selected={selected}
                onSelect={handleSelect}
            />
            <section className={styles.identity} aria-live='polite'>
                <span className={styles.code}>{selected}</span>
                <div>
                    <h2>{metadata.name}</h2>
                    <p>{metadata.description}</p>
                    {isTranslation && <p>{copy.translationTarget}</p>}
                </div>
            </section>
            <section className={styles.source}>
                <PromptRecipe
                    key={`${demoKey}-source`}
                    title={copy.source}
                    text={current.sourceText}
                    copyLabel={copy.copySource}
                    copy={copy}
                />
            </section>
            <section className={styles.demo} data-testid='workbook-demo'>
                <LearningBlockView
                    key={demoKey}
                    block={current.block}
                    labels={labels}
                    scope={`guide-${demoKey}`}
                    expandAll={expansion}
                    checkingLabelOverride={checkingLabel}
                />
                <Button type='button' variant='ghost' onClick={handleReset}>
                    {copy.reset}
                </Button>
            </section>
            <section className={styles.explanation}>
                <h3>{copy.why}</h3>
                <p>{current.useCaseGuidance}</p>
            </section>
            <SampleFeedback
                key={demoKey}
                responses={current.sampleResponses}
                copy={copy}
                labels={labels}
            />
            <section className={styles.recipes} aria-label={copy.recipes}>
                <h2>{copy.recipes}</h2>
                <p>{copy.prerequisite}</p>
                <div id='recipe-specific'>
                    <PromptRecipe
                        key={demoKey}
                        title={content.recipes[0]!.title}
                        text={promptText}
                        copyLabel={copy.copy}
                        copy={copy}
                    />
                </div>
                {otherRecipes.map((recipe) => (
                    <div
                        id={`recipe-${recipe.id}`}
                        key={`${demoKey}-${recipe.id}`}
                    >
                        <PromptRecipe
                            title={recipe.title}
                            text={`${recipe.prompt}\n\n${current.sourceText}`}
                            copyLabel={copy.copy}
                            copy={copy}
                        />
                    </div>
                ))}
                <p>{copy.expected}</p>
            </section>
        </div>
    );
}
