import { ArrowRight, BookOpen, Sparkles } from 'lucide-react';
import type { Locale } from '@/fsd/shared/i18n';
import { ButtonLink, TextLink } from '@/fsd/shared/ui';
import { guideCopy } from '../../lib/content';
import { guideUiCopy } from '../copy';
import styles from '../styles/guide-page-common.module.css';

export function WorkbookGuidePage({ locale }: { locale: Locale }) {
    const copy = guideUiCopy(locale);
    const content = guideCopy(locale);

    return (
        <main className={styles.main}>
            <header className={styles.hero}>
                <span className={styles.eyebrow}>
                    <BookOpen size={18} aria-hidden='true' /> LANGUON
                </span>
                <h1>{copy.title}</h1>
                <p className={styles.lead}>{copy.intro}</p>
            </header>
            <section className={styles.section}>
                <h2>{copy.workflow}</h2>
                <ol className={styles.steps}>
                    {content.steps.map((step, index) => (
                        <li key={step}>
                            <span className={styles.stepNumber}>
                                {index + 1}
                            </span>
                            <p>{step}</p>
                        </li>
                    ))}
                </ol>
            </section>
            <section className={styles.chapter}>
                <div>
                    <span className={styles.eyebrow}>
                        <Sparkles size={18} aria-hidden='true' />
                        {copy.chapter}
                    </span>
                    <h2>{copy.explore}</h2>
                    <p>{copy.formats}</p>
                    <p>{copy.chapterIntro}</p>
                </div>
                <ButtonLink href='/workbook/exercises'>
                    {copy.explore}
                    <ArrowRight size={16} aria-hidden='true' />
                </ButtonLink>
            </section>
            <section className={styles.section}>
                <h2>{copy.recipes}</h2>
                <div className={styles.recipeLinks}>
                    {content.recipes.map((recipe) => (
                        <TextLink
                            key={recipe.id}
                            href={`/workbook/exercises#recipe-${recipe.id}`}
                        >
                            {recipe.title}{' '}
                            <ArrowRight size={16} aria-hidden='true' />
                        </TextLink>
                    ))}
                </div>
            </section>
            <p className={styles.note}>{copy.distinction}</p>
        </main>
    );
}
