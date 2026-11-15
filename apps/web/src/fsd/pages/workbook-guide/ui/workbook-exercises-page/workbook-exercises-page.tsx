import { Sparkles } from 'lucide-react';
import type { Locale } from '@/fsd/shared/i18n';
import { Breadcrumb, ButtonLink } from '@/fsd/shared/ui';
import { guideActivities } from '../../lib/examples';
import { WorkbookExercisesLayout } from '../workbook-exercises-layout/workbook-exercises-layout';
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
        <main className={`${styles.main} ${styles.exercisesPage}`}>
            <Breadcrumb items={breadcrumbs} />
            <WorkbookExercisesLayout
                locale={locale}
                activities={guideActivities(locale)}
                initialActivity={activity}
                header={
                    <header className={styles.hero} key='chapter-header'>
                        <span className={styles.eyebrow}>
                            <Sparkles size={16} aria-hidden='true' />
                            {copy.formats}
                        </span>
                        <h1>{copy.chapter}</h1>
                        <p className={styles.lead}>{copy.chapterIntro}</p>
                        <p className={styles.notice}>{copy.notice}</p>
                    </header>
                }
                footer={
                    <section className={styles.section} key='chapter-footer'>
                        <h2>{copy.next}</h2>
                        <p>{copy.handoff}</p>
                        <ButtonLink href='/knowledge'>
                            {copy.openKnowledge}
                        </ButtonLink>
                    </section>
                }
            />
        </main>
    );
}
