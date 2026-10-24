const grantReason =
    'Local development setup: initial synthetic learner credits v1';

/** One grant per test account across profiles; optimistic concurrency prevents duplicates. */
export async function grantTestLearner({
    learnerId,
    contracts: c,
    request,
    apply,
    log = console.log,
}) {
    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            learnerId,
        )
    )
        throw new Error('learner-id must be a UUID.');
    const { user } = await request(
        `/admin/users/${learnerId}`,
        c.AdminUserResponseSchema,
    );
    if (
        !user.primaryEmail.toLowerCase().endsWith('.test') ||
        user.status !== 'active' ||
        user.isOwner
    )
        throw new Error(
            'Optional setup credits require an active, non-owner synthetic learner with a .test email.',
        );
    const base = `/admin/users/${learnerId}/ai-credits`;
    const initial = await request(
        `${base}?page=1&pageSize=100`,
        c.AdminAiCreditsResponseSchema,
    );
    if (
        initial.account.reservedCredits !== 0 ||
        initial.account.effectiveMode !== 'limited'
    )
        throw new Error(
            'Grant requires a limited learner account with no active credit reservations.',
        );
    const pages = Math.ceil(initial.total / 100);
    if (pages > 100)
        throw new Error(
            'Credit history is too large for safe setup verification; use admin review.',
        );
    let history = initial.history;
    for (let page = 2; page <= pages; page += 1) {
        const result = await request(
            `${base}?page=${page}&pageSize=100`,
            c.AdminAiCreditsResponseSchema,
        );
        if (
            result.account.managementVersion !==
            initial.account.managementVersion
        )
            throw new Error(
                'Credit account changed during preview. Rerun setup.',
            );
        history = history.concat(result.history);
    }
    if (
        history.some(
            (entry) => entry.kind === 'grant' && entry.reason === grantReason,
        )
    ) {
        log(
            'Synthetic learner credits: initial grant already recorded; no additional credits.',
        );
        return;
    }
    const body = c.AdminAiCreditAdjustmentRequestSchema.parse({
        expectedVersion: initial.account.managementVersion,
        amountCredits: 100,
        expiresAt: null,
        reason: grantReason,
    });
    log(
        `Synthetic learner credits: ${apply ? 'granting' : 'would grant'} 100 once. Future top-ups remain explicit admin actions.`,
    );
    if (apply)
        await request(
            `${base}/adjustments`,
            c.AdminAiCreditsResponseSchema,
            'POST',
            body,
        );
}
