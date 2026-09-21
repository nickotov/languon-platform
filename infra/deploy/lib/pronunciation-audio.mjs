const lifecycle = [
    'workerProcessable',
    'apiReadable',
    'webReadable',
    'purgeReadable',
];
const budgetFields = [
    'maxCharacters',
    'maxCostUnitsPerClip',
    'ownerDailyCostUnits',
    'globalDailyCostUnits',
];

export function normalizePronunciationAudio(input) {
    if (input === undefined) return undefined;
    if (!input || !['expand', 'activate'].includes(input.phase)) {
        throw new Error('pronunciationAudio.phase must be expand or activate.');
    }
    const result = { phase: input.phase };
    for (const name of [...lifecycle, 'apiEnqueued']) {
        const versions = input[name];
        if (
            !Array.isArray(versions) ||
            versions.some(
                (version) => !Number.isSafeInteger(version) || version < 1,
            ) ||
            new Set(versions).size !== versions.length
        ) {
            throw new Error(
                `pronunciationAudio.${name} must contain unique positive versions.`,
            );
        }
        result[name] = [...versions].sort((a, b) => a - b);
    }
    for (const name of lifecycle) {
        if (
            result.apiEnqueued.some(
                (version) => !result[name].includes(version),
            )
        ) {
            throw new Error(
                `pronunciationAudio.${name} must support every enqueued version.`,
            );
        }
    }
    if (
        !input.speechBudget ||
        Object.keys(input.speechBudget).length !== budgetFields.length
    ) {
        throw new Error('pronunciationAudio.speechBudget is required.');
    }
    result.speechBudget = {};
    for (const name of budgetFields) {
        const value = input.speechBudget[name];
        if (!Number.isSafeInteger(value) || value < 1)
            throw new Error(
                `pronunciationAudio.speechBudget.${name} must be positive.`,
            );
        result.speechBudget[name] = value;
    }
    if (
        result.speechBudget.maxCostUnitsPerClip >
            result.speechBudget.ownerDailyCostUnits ||
        result.speechBudget.ownerDailyCostUnits >
            result.speechBudget.globalDailyCostUnits
    ) {
        throw new Error(
            'Pronunciation speech budgets must cover clip, owner, and global ceilings.',
        );
    }
    if (result.speechBudget.maxCharacters > 2000)
        throw new Error(
            'Pronunciation maxCharacters exceeds the supported 2000-character envelope.',
        );
    return result;
}

export function assertPronunciationAudioCompatibility(
    candidate,
    floor,
    { direction = 'forward' } = {},
) {
    const next = candidate.pronunciationAudio;
    const previous = floor?.pronunciationAudio;
    for (const [writer, reader, label] of [
        [next, previous, 'Rollback-floor'],
        [previous, next, 'Candidate'],
    ]) {
        for (const version of writer?.apiEnqueued ?? []) {
            for (const name of lifecycle) {
                if (!reader?.[name].includes(version))
                    throw new Error(
                        `${label} pronunciation ${name} does not support version ${version}.`,
                    );
            }
        }
    }
    // Audio assets survive disabled generation and have no automatic retirement.
    // Once deployed, retain lifecycle support even if no jobs are enqueued now.
    for (const name of lifecycle) {
        for (const version of previous?.[name] ?? []) {
            if (!next?.[name].includes(version))
                throw new Error(
                    `Pronunciation ${name} cannot retire retained audio version ${version}.`,
                );
        }
    }
    const newlyEnqueued = (next?.apiEnqueued ?? []).filter(
        (version) => !previous?.apiEnqueued.includes(version),
    );
    if (
        direction === 'forward' &&
        next?.phase === 'expand' &&
        newlyEnqueued.length
    )
        throw new Error(
            'Pronunciation expand release cannot activate generation.',
        );
    if (
        next &&
        previous &&
        next.workerProcessable.some((version) =>
            previous.workerProcessable.includes(version),
        )
    ) {
        for (const name of budgetFields) {
            if (next.speechBudget[name] !== previous.speechBudget[name])
                throw new Error(
                    'Pronunciation speech budgets must remain stable during worker overlap.',
                );
        }
    }
}
