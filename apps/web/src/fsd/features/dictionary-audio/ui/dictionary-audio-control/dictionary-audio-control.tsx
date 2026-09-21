import type { DictionaryAudioField, DictionaryCard } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Select } from '@/fsd/shared/ui';
import type { useDictionaryAudio } from '../../hooks/use-dictionary-audio';
import styles from './dictionary-audio-control.module.css';

export function DictionaryAudioControl({
    card,
    field,
    playback,
}: {
    card: DictionaryCard;
    field: DictionaryAudioField;
    playback: ReturnType<typeof useDictionaryAudio>;
}) {
    const { locale, t } = useI18n();
    const selected =
        playback.state.selection?.card.id === card.id &&
        playback.state.selection.field === field;
    const phase = selected ? playback.state.phase : 'idle';
    const busy = phase === 'loading' || phase === 'playing';
    const label = t(`dictionary.field.${field}`);
    return (
        <span className={styles.control} dir='ltr' lang={locale}>
            <Button
                type='button'
                variant='quiet'
                size='compact'
                aria-label={t(
                    busy
                        ? 'dictionary.audio.stopField'
                        : 'dictionary.audio.playField',
                    { field: label },
                )}
                onClick={() =>
                    busy ? playback.stop() : void playback.play({ card, field })
                }
            >
                {t(busy ? 'dictionary.audio.stop' : 'dictionary.audio.play')}
            </Button>
            {selected ? (
                <>
                    <span role='status' className={styles.status}>
                        {phase !== 'idle' ? t(`dictionary.audio.${phase}`) : ''}
                        {playback.state.fixture
                            ? ` ${t('dictionary.audio.fixture')}`
                            : ''}
                    </span>
                    <Select
                        aria-label={t('dictionary.audio.speed')}
                        fullWidth={false}
                        value={String(playback.speed)}
                        onChange={(event) =>
                            playback.setSpeed(Number(event.target.value))
                        }
                        options={[
                            { value: '1', label: t('dictionary.audio.normal') },
                            { value: '0.8', label: '0.8×' },
                        ]}
                    />
                </>
            ) : null}
        </span>
    );
}
