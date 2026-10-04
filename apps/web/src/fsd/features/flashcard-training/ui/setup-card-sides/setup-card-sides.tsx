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
        <section aria-labelledby={id} className='flex flex-col gap-3'>
            <div>
                <h3
                    id={id}
                    className='text-base font-semibold text-text-primary'
                >
                    {t('training.sides')}
                </h3>
                <p className='text-sm text-text-secondary'>
                    {t('training.sidesHelp')}
                </p>
            </div>
            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
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
            <p className='flex gap-2 text-sm text-text-secondary'>
                <Info aria-hidden className='mt-0.5 h-4 w-4 shrink-0' />
                <span>{t('training.fallbackHelp')}</span>
            </p>
        </section>
    );
}
