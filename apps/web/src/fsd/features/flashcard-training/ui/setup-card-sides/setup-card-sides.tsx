import styles from './setup-card-sides.module.css';
import { useId } from 'react';
import { Info } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { InlineAlert } from '@/fsd/shared/ui';
import type { useFlashcardSetup } from '../../hooks/use-flashcard-setup';
import { FieldGroup } from '../field-group/field-group';

export function SetupCardSides({
    setup,
}: {
    setup: ReturnType<typeof useFlashcardSetup>;
}) {
    const { t } = useI18n();

    const id = useId();

    const disabled = setup.starting || setup.prefsStatus === 'loading';

    return (
        <section aria-labelledby={id} className={styles.section}>
            <div>
                <h3 id={id} className={styles.title}>
                    {t('training.sides')}
                </h3>
                <p className={styles.description}>{t('training.sidesHelp')}</p>
            </div>
            <div className={styles.sides}>
                <FieldGroup
                    side='front'
                    selected={setup.front}
                    onChange={setup.setFront}
                    invalid={setup.frontError}
                    disabled={disabled}
                />
                <FieldGroup
                    side='back'
                    selected={setup.back}
                    onChange={setup.setBack}
                    invalid={setup.backError}
                    disabled={disabled}
                />
            </div>
            {setup.identicalSides && (
                <InlineAlert tone='tip' title={t('training.identical')}>
                    {t('training.identicalHelp')}
                </InlineAlert>
            )}
            <p className={styles.help}>
                <Info aria-hidden className={styles.helpIcon} />
                <span>{t('training.fallbackHelp')}</span>
            </p>
        </section>
    );
}
