const SAFE_OUTCOMES = new Set(['succeeded', 'failed', 'rolled-back']);

export function createAuditRecord({
    actor,
    environment,
    manifest,
    migration,
    newSlot,
    outcome,
    previousSlot,
    startedAt,
    timings,
    forcedDrain = false,
    failurePhase,
}) {
    if (!SAFE_OUTCOMES.has(outcome)) throw new Error('Invalid audit outcome.');
    return {
        schemaVersion: 1,
        actor: String(actor || 'local')
            .replace(/[^A-Za-z0-9_.@-]/g, '_')
            .slice(0, 128),
        environment,
        identity: manifest.identity,
        sourceSha: manifest.sourceSha,
        workflowRun: manifest.workflowRun,
        images: manifest.images,
        migration: {
            compatibility: manifest.migration.compatibility,
            ledger: migration?.ledger ?? manifest.migration.ledger,
            outcome: migration?.outcome ?? 'not-run',
        },
        previousSlot,
        newSlot,
        startedAt,
        completedAt: new Date().toISOString(),
        timings,
        forcedDrain,
        ...(failurePhase ? { failurePhase } : {}),
        outcome,
    };
}
