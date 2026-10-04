import { LoaderCircle, Square, Volume2 } from 'lucide-react';
import type { DictionaryAudioField, DictionaryCard } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { IconButton } from '@/fsd/shared/ui';
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

    function handlePlayback() {
        if (busy) {
            playback.stop();

            return;
        }

        void playback.play({ card, field });
    }

    function renderPlaybackIcon() {
        if (phase === 'loading') {
            return <LoaderCircle size={15} aria-hidden='true' />;
        }

        if (busy) {
            return <Square size={15} aria-hidden='true' />;
        }

        return <Volume2 size={15} aria-hidden='true' />;
    }

    const resolvedPlaybackIcon = renderPlaybackIcon();

    return (
        <span className={styles.control} dir='ltr' lang={locale}>
            <IconButton
                type='button'
                label={t(
                    busy
                        ? 'dictionary.audio.stopField'
                        : 'dictionary.audio.playField',
                    { field: label },
                )}
                onClick={handlePlayback}
            >
                {resolvedPlaybackIcon}
            </IconButton>
            {selected ? (
                <>
                    <span role='status' className={styles.status}>
                        {phase !== 'idle' ? t(`dictionary.audio.${phase}`) : ''}
                        {playback.state.fixture
                            ? ` ${t('dictionary.audio.fixture')}`
                            : ''}
                    </span>
                </>
            ) : null}
        </span>
    );
}
