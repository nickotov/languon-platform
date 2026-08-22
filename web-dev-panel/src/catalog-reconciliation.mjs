import { packageScriptRevision } from './source-revision.mjs';

export function reconcileExistingPackageCommand(previous, id, script) {
    const revision = packageScriptRevision(id, script);
    if (previous.source.revision !== revision) {
        return {
            ...previous,
            batchEligible: false,
            disabledReason:
                'Changed package script requires an explicit safety review.',
            enabled: false,
            source: {
                ...previous.source,
                revision,
            },
        };
    }
    return {
        ...previous,
        source: {
            ...previous.source,
            revision,
        },
    };
}
