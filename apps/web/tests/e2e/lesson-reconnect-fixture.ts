import { expect, type Page } from '@playwright/test';
import type { GenerationRunSummary, GenerationPlan } from '@languon/contracts';

/** Exercise a quiet SSE rotation and rejected admission against the real chat UI.
 * All fault responses live in the browser; this helper cannot dispatch a turn. */
export async function verifyIdleLessonRecovery(
    page: Page,
    previewUrl: string,
    token: string,
) {
    const url = new URL(previewUrl);
    const listPath = url.pathname.slice(
        0,
        url.pathname.indexOf('/generation-runs') + '/generation-runs'.length,
    );
    const conversationId = listPath.split('/').at(-2)!;
    const detail = await page.request.get(
        previewUrl.replace(/\/preview$/u, ''),
        { headers: { Authorization: 'Bearer ' + token } },
    );

    expect(detail.ok()).toBeTruthy();
    const { run, plan: lessonPlan } = (await detail.json()) as {
        run: GenerationRunSummary;
        plan: GenerationPlan;
    };
    const first: GenerationRunSummary = {
        ...run,
        conversationId,
        id: '11111111-1111-4111-8111-111111111111',
        state: 'paused',
        pauseReason: 'budget',
        automation: undefined,
        activeTurnId: null,
        proposalId: null,
        tasks: run.tasks.map((task, i) =>
            i === 0
                ? { ...task, status: 'pending', completedUnitCount: undefined }
                : task,
        ),
        completedTaskCount: run.tasks.length - 1,
    };
    const second = { ...first, id: '22222222-2222-4222-8222-222222222222' };

    const blocked: GenerationRunSummary = {
        ...first,
        id: '33333333-3333-4333-8333-333333333333',
        pauseReason: 'technical-failure',
        failure: {
            code: 'admission-blocked',
            admissionReason: 'context-too-large',
        },
    };

    const filtered: GenerationRunSummary = {
        ...first,
        id: '44444444-4444-4444-8444-444444444444',
        pauseReason: 'technical-failure',
        failure: {
            code: 'provider-rejected',
            phase: 'decode',
            finishReason: 'content-filter',
        },
    };
    const capacityRun = {
        ...first,
        id: '55555555-5555-4555-8555-555555555555',
    };
    const quoteId = '66666666-6666-4666-8666-666666666666';
    const capacityReference = '77777777-7777-4777-8777-777777777777';
    const exercise = {
        id: 'reading-check',
        kind: 'exercises',
        status: 'pending',
        label: 'Reading comprehension',
        completedUnitCount: 2,
        totalUnitCount: 3,
    } as const;
    const repairing: GenerationRunSummary = {
        ...first,
        id: '88888888-8888-4888-8888-888888888888',
        tasks: [exercise],
        totalTaskCount: 1,
        completedTaskCount: 0,
        automation: {
            enabled: true,
            maximumCredits: '1',
            remainingCredits: '1',
            recoveringTaskId: exercise.id,
        },
    };
    const exhausted: GenerationRunSummary = {
        ...repairing,
        id: '99999999-9999-4999-8999-999999999999',
        automation: undefined,
        pauseReason: 'technical-failure',
        failure: {
            code: 'schema-invalid',
            taskId: exercise.id,
            recoveryExhausted: true,
        },
    };
    const pausedRuns = [
        first,
        second,
        blocked,
        filtered,
        capacityRun,
        repairing,
        exhausted,
    ];

    await verifyWholeLessonQuote(page, listPath, quoteId);
    await page.addInitScript(() => {
        const fetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
            const url = new URL(
                input instanceof Request ? input.url : String(input),
                location.href,
            );

            if (!/\/conversations\/[^/]+\/events$/u.test(url.pathname)) {
                return fetch(input, init);
            }

            const signal = init?.signal;

            return Promise.resolve(
                new Response(
                    new ReadableStream<Uint8Array>({
                        start(controller) {
                            controller.enqueue(
                                new TextEncoder().encode(
                                    'event: heartbeat\ndata: {}\n\n',
                                ),
                            );

                            function close() {
                                signal?.removeEventListener('abort', close);
                                window.removeEventListener(
                                    'rotate-test-lesson-stream',
                                    close,
                                );

                                controller.close();
                            }

                            signal?.addEventListener('abort', close, {
                                once: true,
                            });

                            window.addEventListener(
                                'rotate-test-lesson-stream',
                                close,
                                { once: true },
                            );
                        },
                    }),
                    { headers: { 'content-type': 'text/event-stream' } },
                ),
            );
        };
    });

    let reads = 0;
    let release!: () => void;
    const deferred = new Promise<void>((resolve) => {
        release = resolve;
    });
    const posts: string[] = [];
    let releaseStop!: () => void;
    const stopping = new Promise<void>((resolve) => {
        releaseStop = resolve;
    });

    await page.route(`**${listPath}**`, async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (route.request().method() === 'POST') {
            posts.push(path);
            if (path.endsWith(`/${repairing.id}/stop`)) {
                expect(route.request().postDataJSON()).toMatchObject({
                    expectedRevision: repairing.revision,
                    requestId: expect.any(String),
                });

                await stopping;
                const stopped: GenerationRunSummary = {
                    ...repairing,
                    automation: undefined,
                    pauseReason: 'stopped',
                    updatedAt: new Date(
                        Date.parse(repairing.updatedAt) + 1,
                    ).toISOString(),
                };

                pausedRuns[pausedRuns.indexOf(repairing)] = stopped;

                return route.fulfill({
                    json: { run: stopped, plan: lessonPlan },
                });
            }

            if (path.endsWith(`/${capacityRun.id}/continue`)) {
                if (!route.request().postDataJSON().confirmedQuoteId) {
                    return route.fulfill({
                        status: 409,
                        json: {
                            error: {
                                code: 'action_confirmation_required',
                                message: 'Confirm this allowance.',
                                details: {
                                    quote: {
                                        id: quoteId,
                                        maximumCredits: '1.000',
                                        approximateOutputTokens: 2500,
                                        expiresAt: new Date(
                                            Date.now() + 60_000,
                                        ).toISOString(),
                                    },
                                },
                            },
                        },
                    });
                }

                expect(route.request().postDataJSON().confirmedQuoteId).toBe(
                    quoteId,
                );

                return route.fulfill({
                    status: 503,
                    json: {
                        error: {
                            code: 'provider_capacity_exhausted',
                            message: 'Provider capacity unavailable.',
                            requestId: capacityReference,
                        },
                    },
                });
            }

            if (path.endsWith(`/${first.id}/continue`)) {
                return route.fulfill({
                    status: 400,
                    body: 'Invalid response body',
                    headers: {
                        'x-correlation-id':
                            '56837731-a428-4dee-9db8-37b43dcb942e',
                    },
                });
            }

            return route.fulfill({
                status: 400,
                json: {
                    error: {
                        code: 'context_too_large',
                        message: 'Fixture admission rejected.',
                        correlationId: '794a4887-a431-40c5-8f9a-90e479d80d72',
                    },
                },
            });
        }

        if (path === listPath) {
            reads += 1;
            if (reads === 2) {
                await deferred;
            }

            return route.fulfill({ json: { runs: pausedRuns } });
        }

        return route.fulfill({
            json: {
                run: pausedRuns.find((run) => path.endsWith(run.id)),
                plan: lessonPlan,
            },
        });
    });

    await page.reload();
    const firstCard = page.locator(`[data-lesson-run="${first.id}"]`);
    const secondCard = page.locator(`[data-lesson-run="${second.id}"]`);
    const resume = secondCard.getByRole('button', {
        name: 'Continue',
        exact: true,
    });

    const blockedCard = page.locator(`[data-lesson-run="${blocked.id}"]`);
    await expect(
        blockedCard.getByText(/source material for this step exceeds/i),
    ).toBeVisible();

    await expect(
        blockedCard.getByRole('button', { name: 'Retry remaining part' }),
    ).toBeDisabled();

    await expect(
        blockedCard.getByRole('button', { name: 'Adjust plan' }),
    ).toBeEnabled();

    const filteredCard = page.locator(`[data-lesson-run="${filtered.id}"]`);
    await expect(
        filteredCard.getByText(/declined this part under its content policy/i),
    ).toBeVisible();

    await expect(
        filteredCard.getByRole('button', { name: 'Retry remaining part' }),
    ).toBeDisabled();

    await expect(
        filteredCard.getByRole('button', { name: 'Adjust plan' }),
    ).toBeEnabled();

    const repairingCard = page.locator(`[data-lesson-run="${repairing.id}"]`);
    await expect(
        repairingCard.getByText(/Automatically correcting/u),
    ).toBeVisible();

    await expect(
        repairingCard.getByRole('button', { name: 'Stop' }),
    ).toBeEnabled();

    const exhaustedCard = page.locator(`[data-lesson-run="${exhausted.id}"]`);
    await expect(
        exhaustedCard.getByText(/could not produce a valid result/u),
    ).toBeVisible();

    await expect(
        exhaustedCard.getByRole('button', { name: 'Adjust plan' }),
    ).toBeEnabled();

    for (const card of [repairingCard, exhaustedCard]) {
        await expect(
            card
                .getByText('Exercise 3 of 3', { exact: true })
                .filter({ visible: true }),
        ).toBeVisible();

        await expect(
            card.getByRole('button', { name: 'View prepared content' }),
        ).toBeEnabled();

        await expect(
            card.getByRole('button', { name: /continue|retry|resume/i }),
        ).toHaveCount(0);
    }

    const composerStop = page
        .locator('form[data-workspace="true"]')
        .getByRole('button', { name: 'Stop', exact: true });

    await expect(composerStop).toBeEnabled();
    await expect(resume).toBeEnabled();
    await page.evaluate(() =>
        window.dispatchEvent(new Event('rotate-test-lesson-stream')),
    );

    try {
        await expect.poll(() => reads).toBe(2);
        await expect(resume).toBeDisabled();
        await expect(composerStop).toBeDisabled();
    } finally {
        release();
    }

    await expect(resume).toBeEnabled();
    await resume.click();
    await expect(secondCard.getByRole('alert')).toContainText(
        'The request was rejected before generation started.',
    );

    await expect(secondCard.getByRole('alert')).toContainText(
        'context_too_large',
    );

    await expect(firstCard.getByRole('alert')).toHaveCount(0);
    await expect(
        firstCard.getByRole('button', { name: 'Continue', exact: true }),
    ).toBeEnabled();

    await expect(secondCard.getByRole('alert')).toContainText(
        '794a4887-a431-40c5-8f9a-90e479d80d72',
    );

    await firstCard
        .getByRole('button', { name: 'Continue', exact: true })
        .click();

    await expect(firstCard.getByRole('alert')).toContainText(
        '56837731-a428-4dee-9db8-37b43dcb942e',
    );

    await expect(secondCard.getByRole('alert')).toContainText(
        'context_too_large',
    );

    const capacityCard = page.locator(`[data-lesson-run="${capacityRun.id}"]`);
    await capacityCard
        .getByRole('button', { name: 'Continue', exact: true })
        .click();

    await expect(page.getByRole('dialog')).toContainText(
        'Approximate output tokens per stage:',
    );

    await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Continue' })
        .click();

    await expect(capacityCard.getByRole('alert')).toContainText(
        'The AI provider’s usage limit',
    );

    await expect(capacityCard.getByRole('alert')).toContainText(
        capacityReference,
    );

    await expect(
        capacityCard.getByRole('button', { name: 'Refresh', exact: true }),
    ).toHaveCount(0);

    await expect(
        capacityCard.getByRole('button', { name: 'Continue', exact: true }),
    ).toBeEnabled();

    await composerStop.click();
    try {
        await expect
            .poll(() => posts.at(-1))
            .toBe(`${listPath}/${repairing.id}/stop`);

        await expect(composerStop).toBeDisabled();
        await expect(
            repairingCard.getByRole('button', { name: 'Stop', exact: true }),
        ).toBeDisabled();
    } finally {
        releaseStop();
    }

    await expect(composerStop).toHaveCount(0);
    await expect(
        repairingCard.getByRole('button', { name: 'Stop', exact: true }),
    ).toHaveCount(0);

    expect(posts).toEqual([
        `${listPath}/${second.id}/continue`,
        `${listPath}/${first.id}/continue`,
        `${listPath}/${capacityRun.id}/continue`,
        `${listPath}/${capacityRun.id}/continue`,
        `${listPath}/${repairing.id}/stop`,
    ]);

    return `503 ${listPath}/${capacityRun.id}/continue`;
}

async function verifyWholeLessonQuote(
    page: Page,
    listPath: string,
    quoteId: string,
) {
    const turnPath = listPath.replace(/generation-runs$/u, 'turns');
    let quoteRequests = 0;
    await page.route(`**${turnPath}`, (route) => {
        if (route.request().method() !== 'POST') {
            return route.continue();
        }

        quoteRequests += 1;

        return route.fulfill({
            status: 409,
            json: {
                error: {
                    code: 'action_confirmation_required',
                    message: 'Confirm the allowance.',
                    details: {
                        quote: {
                            id: quoteId,
                            scope: 'lesson-if-planned',
                            maximumCredits: '2.500',
                            approximateOutputTokens: 2500,
                            expiresAt: new Date(
                                Date.now() + 60_000,
                            ).toISOString(),
                        },
                    },
                },
            },
        });
    });

    await page.getByLabel('Your question').fill('Prepare another lesson.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const initialConsent = page.getByRole('dialog', {
        name: 'Review this action’s budget',
    });

    await expect(initialConsent).toContainText(
        'covers the entire lesson, including automatic retries',
    );

    await expect(initialConsent).toContainText(
        'Approximate output tokens per stage: 2,500',
    );

    await initialConsent.getByRole('button', { name: 'Cancel' }).click();
    expect(quoteRequests).toBe(1);
}
