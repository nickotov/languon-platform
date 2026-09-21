import type { AudioBudget } from '../../application/ports/dictionary-audio-store';
import type { DictionaryAudioEnvironment } from './dictionary-audio-environment';

export function dictionaryAudioBudget(
    environment: DictionaryAudioEnvironment,
): AudioBudget {
    return {
        ownerDailyCost: environment.ownerBudgetUnits,
        globalDailyCost: environment.globalBudgetUnits,
        ownerQueued: environment.ownerQueuedLimit,
        ownerActive: environment.ownerActiveLimit,
        globalActive: environment.globalActiveLimit,
        maxCharacters: environment.maxCharacters,
        maxCostPerClip: environment.maxCostPerClip,
    };
}
