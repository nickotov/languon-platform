import type { Locale } from '@/fsd/shared/i18n';
import { Breadcrumb, ButtonLink } from '@/fsd/shared/ui';
import { guideActivities } from '../../lib/examples';
import { ExerciseExplorer } from '../exercise-explorer/exercise-explorer';
import { guideUiCopy } from '../copy';
import styles from '../styles/guide-page-common.module.css';

export function WorkbookExercisesPage({
    locale,
    activity,
}: {
    locale: Locale;
    activity?: string | undefined;
}) {
    const copy = guideUiCopy(locale);
    const breadcrumbs = [
        { label: copy.title, href: '/workbook' },
        { label: copy.chapter },
    ];

    return (
        <main className={styles.main}>
            <Breadcrumb items={breadcrumbs} />
            <header className={styles.hero}>
                <h1>{copy.chapter}</h1>
                <p className={styles.lead}>{copy.chapterIntro}</p>
            </header>
            <p className={styles.notice}>{copy.notice}</p>
            <ExerciseExplorer
                locale={locale}
                activities={guideActivities(locale)}
                initialActivity={activity}
            />
            <section className={styles.section}>
                <h2>{copy.next}</h2>
                <p>{copy.handoff}</p>
                <ButtonLink href='/knowledge'>{copy.openKnowledge}</ButtonLink>
            </section>
        </main>
    );
}
