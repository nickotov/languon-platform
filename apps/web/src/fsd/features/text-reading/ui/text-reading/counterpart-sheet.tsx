import { readingFragment } from '../../lib/reading-fragment';
import type { Dispatch, SetStateAction } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BottomSheet, Button } from '@/fsd/shared/ui';
import { useReadingCopy } from '../../hooks/use-reading-copy';
import type { ReadingDocument } from '../../types';
import styles from './text-reading.module.css';

export function CounterpartSheet({
    sheet,
    setSheet,
    doc,
    language,
}: {
    sheet: number | null;
    setSheet: Dispatch<SetStateAction<number | null>>;
    doc: ReadingDocument;
    language: (code: string) => string;
}) {
    const t = useReadingCopy();
    const pairs = doc.alignment?.source ?? [];
    const translation = doc.alignment?.translation ?? [];

    function close() {
        setSheet(null);
    }

    function previous() {
        setSheet((sheet ?? 0) - 1);
    }

    function next() {
        setSheet((sheet ?? 0) + 1);
    }

    return (
        <BottomSheet
            open={sheet !== null}
            onClose={close}
            title={t('texts.reading.sentence', {
                index: (sheet ?? 0) + 1,
                total: pairs.length,
            })}
            closeLabel={t('texts.collect.close')}
            footer={
                <div className={styles.sheetActions}>
                    <Button
                        desktopIconOnly
                        className={styles.counterpartNavigation}
                        variant='secondary'
                        aria-label={t('texts.reading.previous')}
                        disabled={!sheet}
                        onClick={previous}
                        leadingIcon={<ChevronLeft size={16} />}
                    >
                        {t('texts.reading.previous')}
                    </Button>
                    <Button fullWidth onClick={close}>
                        {t('texts.reading.back')}
                    </Button>
                    <Button
                        desktopIconOnly
                        className={styles.counterpartNavigation}
                        variant='secondary'
                        aria-label={t('texts.reading.next')}
                        disabled={sheet === pairs.length - 1}
                        onClick={next}
                        trailingIcon={<ChevronRight size={16} />}
                    >
                        {t('texts.reading.next')}
                    </Button>
                </div>
            }
        >
            {sheet !== null && (
                <div className={styles.counterpart} aria-live='polite'>
                    <section>
                        <h3>
                            {t('texts.reading.source')} ·{' '}
                            {language(doc.sourceLanguage)}
                        </h3>
                        <p lang={doc.sourceLanguage} dir='auto'>
                            {readingFragment(pairs[sheet]?.text ?? '').text}
                        </p>
                    </section>
                    <section>
                        <h3>
                            {t('texts.reading.translation')} ·{' '}
                            {language(doc.targetLanguage)}
                        </h3>
                        <p lang={doc.targetLanguage} dir='auto'>
                            {
                                readingFragment(translation[sheet]?.text ?? '')
                                    .text
                            }
                        </p>
                    </section>
                </div>
            )}
        </BottomSheet>
    );
}
