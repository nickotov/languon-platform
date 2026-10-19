import type { DictionaryAudioEnvironment } from './dictionary-audio-environment';

export function dictionaryAudioBudget(environment: DictionaryAudioEnvironment) {
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
