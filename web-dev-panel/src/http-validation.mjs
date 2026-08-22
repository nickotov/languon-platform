const commandIdPattern = /^[a-z0-9](?:[a-z0-9:-]{0,78}[a-z0-9])?$/;

export function validateEmptyBody(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0
    );
}

export function validateBatchBody(value) {
    if (
        value === null ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).length !== 1 ||
        !Object.hasOwn(value, 'selections') ||
        !Array.isArray(value.selections) ||
        value.selections.length === 0 ||
        value.selections.length > 128
    ) {
        return false;
    }
    return value.selections.every(
        (selection) =>
            selection !== null &&
            typeof selection === 'object' &&
            !Array.isArray(selection) &&
            Object.keys(selection).length === 2 &&
            Object.hasOwn(selection, 'id') &&
            Object.hasOwn(selection, 'sourceRevision') &&
            typeof selection.id === 'string' &&
            commandIdPattern.test(selection.id) &&
            typeof selection.sourceRevision === 'string' &&
            /^sha256:[a-f0-9]{64}$/u.test(selection.sourceRevision),
    );
}

export function validateCommandId(value) {
    return typeof value === 'string' && commandIdPattern.test(value);
}

export function validateStopBody(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length === 2 &&
        validateCommandId(value.commandId) &&
        typeof value.runId === 'string' &&
        /^[a-f0-9-]{36}$/u.test(value.runId)
    );
}

export function validateStopSelectedBody(value) {
    if (
        value === null ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).length !== 1 ||
        !Object.hasOwn(value, 'runs') ||
        !Array.isArray(value.runs) ||
        value.runs.length === 0 ||
        value.runs.length > 64
    ) {
        return false;
    }
    return value.runs.every(
        (run) =>
            run !== null &&
            typeof run === 'object' &&
            !Array.isArray(run) &&
            Object.keys(run).length === 2 &&
            Object.hasOwn(run, 'commandId') &&
            Object.hasOwn(run, 'runId') &&
            validateCommandId(run.commandId) &&
            typeof run.runId === 'string' &&
            /^[a-f0-9-]{36}$/u.test(run.runId),
    );
}
