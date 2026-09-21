import type { DictionaryCard, DictionaryAudioField } from '@languon/contracts';

export type AudioSelection = {
    card: DictionaryCard;
    field: DictionaryAudioField;
};
export type AudioPhase =
    | 'idle'
    | 'loading'
    | 'playing'
    | 'stopped'
    | 'ready'
    | 'failed'
    | 'unavailable';
export type AudioPlaybackState = {
    selection: AudioSelection | null;
    phase: AudioPhase;
    fixture: boolean;
};
