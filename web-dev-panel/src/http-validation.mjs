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
