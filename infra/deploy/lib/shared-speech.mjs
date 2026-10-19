const PHASES = new Set(['dormant', 'compatibility', 'enabled', 'retiring']);

function normalizeSpeechBudget(value) {
    const names = [
        'maxCharacters',
        'maxCostUnitsPerClip',
        'ownerDailyCostUnits',
        'globalDailyCostUnits',
    ];
    if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).sort().join(',') !== [...names].sort().join(',')
    )
        throw new Error(
            'sharedSpeech.speechBudget must declare every current ceiling.',
        );
    const budget = {};
    for (const name of names) {
        if (!Number.isSafeInteger(value[name]) || value[name] < 1)
            throw new Error(
                `sharedSpeech.speechBudget.${name} must be positive.`,
            );
        budget[name] = value[name];
    }
    if (
        budget.maxCharacters > 2000 ||
        budget.maxCostUnitsPerClip > budget.ownerDailyCostUnits ||
        budget.ownerDailyCostUnits > budget.globalDailyCostUnits
    )
        throw new Error(
            'Shared speech ceilings must cover clip, owner and global budgets within the 2000-character envelope.',
        );
    return budget;
}

function versions(value, label) {
    if (
        !Array.isArray(value) ||
        value.some((item) => !Number.isSafeInteger(item) || item < 1) ||
        new Set(value).size !== value.length
    ) {
        throw new Error(`${label} must be a unique positive integer array`);
    }
    return value.slice().sort((a, b) => a - b);
}

export function normalizeSharedSpeech(value) {
    if (
        value !== undefined &&
        (!value || typeof value !== 'object' || Array.isArray(value))
    )
        throw new Error('sharedSpeech must be an object');
    const phase = value?.phase ?? 'dormant';
    if (!PHASES.has(phase)) throw new Error('Invalid sharedSpeech phase');
    const result = { phase };
    if (value !== undefined)
        result.speechBudget = normalizeSpeechBudget(value.speechBudget);
    for (const key of [
        'apiEnqueued',
        'apiReadable',
        'workerProcessable',
        'webReadable',
        'adminReadable',
        'purgeReadable',
    ]) {
        result[key] = versions(value?.[key] ?? [], `sharedSpeech.${key}`);
    }
    result.billingSchemas = value?.billingSchemas ?? [];
    if (
        !Array.isArray(result.billingSchemas) ||
        result.billingSchemas.some((item) => item !== 'speech-generation:v1') ||
        new Set(result.billingSchemas).size !== result.billingSchemas.length
    ) {
        throw new Error('Invalid sharedSpeech.billingSchemas');
    }
    if (phase !== 'enabled' && result.apiEnqueued.length)
        throw new Error('Only enabled sharedSpeech may enqueue');
    for (const version of result.apiEnqueued) {
        for (const reader of [
            'apiReadable',
            'workerProcessable',
            'webReadable',
            'adminReadable',
            'purgeReadable',
        ]) {
            if (!result[reader].includes(version))
                throw new Error(
                    `sharedSpeech ${reader} cannot cover admission ${version}`,
                );
        }
        if (!result.billingSchemas.includes('speech-generation:v1'))
            throw new Error(
                'Shared speech admission requires speech-generation:v1 billing',
            );
    }
    return result;
}

export function normalizeModelPricing(value) {
    if (
        value !== undefined &&
        (!value || typeof value !== 'object' || Array.isArray(value))
    )
        throw new Error('modelPricing must be an object');
    const phase = value?.phase ?? 'dormant';
    if (!PHASES.has(phase)) throw new Error('Invalid modelPricing phase');
    const result = {
        phase,
        apiAdmitted: versions(
            value?.apiAdmitted ?? [],
            'modelPricing.apiAdmitted',
        ),
        workerProcessable: versions(
            value?.workerProcessable ?? [],
            'modelPricing.workerProcessable',
        ),
    };
    if (phase !== 'enabled' && result.apiAdmitted.length)
        throw new Error('Only enabled modelPricing may admit');
    if (
        result.apiAdmitted.some(
            (version) => !result.workerProcessable.includes(version),
        )
    )
        throw new Error(
            'Model pricing workers cannot cover admitted revisions',
        );
    return result;
}

export function assertSharedSpeechOverlap(previous, next) {
    const before = previous?.sharedSpeech;
    const after = next.sharedSpeech;
    if (
        before?.workerProcessable.some((version) =>
            after?.workerProcessable.includes(version),
        )
    ) {
        const oldBudget = normalizeSpeechBudget(before.speechBudget);
        const newBudget = normalizeSpeechBudget(after.speechBudget);
        if (
            Object.keys(oldBudget).some(
                (key) => oldBudget[key] !== newBudget[key],
            )
        )
            throw new Error(
                'Shared speech budgets must remain stable during worker overlap.',
            );
    }
    for (const version of before?.apiEnqueued ?? []) {
        if (!(after?.workerProcessable ?? []).includes(version))
            throw new Error(
                `Next worker cannot process previous shared speech ${version}`,
            );
    }
    for (const version of after?.apiEnqueued ?? []) {
        for (const reader of [
            'apiReadable',
            'workerProcessable',
            'webReadable',
            'adminReadable',
            'purgeReadable',
        ]) {
            if (previous && !(before?.[reader] ?? []).includes(version))
                throw new Error(
                    `Rollback floor ${reader} cannot cover shared speech ${version}`,
                );
        }
        if (
            previous &&
            !(before?.billingSchemas ?? []).includes('speech-generation:v1')
        )
            throw new Error('Rollback floor lacks speech billing schema');
    }
    for (const version of previous?.modelPricing?.apiAdmitted ?? []) {
        if (!(next.modelPricing?.workerProcessable ?? []).includes(version))
            throw new Error(
                `Next worker cannot process previous model pricing ${version}`,
            );
    }
    for (const version of next.modelPricing?.apiAdmitted ?? []) {
        if (
            previous &&
            !(previous.modelPricing?.workerProcessable ?? []).includes(version)
        )
            throw new Error(
                `Rollback floor cannot process model pricing ${version}`,
            );
    }
}
