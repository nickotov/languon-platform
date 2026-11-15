'use client';

import { useState, type RefObject } from 'react';
import { LearningBlockView } from '@/fsd/entities/learning-blocks';
import type { Locale } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import type { GuideActivity } from '../../lib/examples';
import { guideCopy } from '../../lib/content';
import { guideUiCopy } from '../copy';
import { guideBlockLabels } from '../labels';
import { PromptRecipe } from '../prompt-recipe/prompt-recipe';
import { SampleFeedback } from '../sample-feedback/sample-feedback';
import styles from './exercise-explorer.module.css';

export function ExerciseExplorer({
    locale,
    current,
    identityRef,
}: {
    locale: Locale;
    current: GuideActivity;
    identityRef: RefObject<HTMLElement | null>;
}) {
    const [revision, setRevision] = useState(0);
    const selected = current.activity.id;
    const copy = guideUiCopy(locale);
    const labels = guideBlockLabels(locale);
    const content = guideCopy(locale);
    const metadata = current.activity.locales[locale];
    const categoryIndex = [
        'vocabulary',
        'grammar',
        'reading',
        'writing',
    ].indexOf(current.activity.category);
    const categoryLabel = copy.categories[categoryIndex];
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

    function handleReset() {
        setRevision((value) => value + 1);
    }

    return (
        <div className={styles.content}>
            <section
                className={styles.identity}
                aria-live='polite'
                ref={identityRef}
            >
                <span className={styles.code}>{selected}</span>
                <div>
                    <span className={styles.category}>{categoryLabel}</span>
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
