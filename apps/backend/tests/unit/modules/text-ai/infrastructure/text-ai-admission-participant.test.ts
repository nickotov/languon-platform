import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrizzleTextAiAdmissionParticipant } from '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import { TextAiSelectionUnavailableError } from '../../../../../src/modules/text-ai/application/text-ai-admission-participant';
import {
    textAiModelCatalog,
    type TextAiExecutionSnapshot,
} from '../../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { resolveAdminTextAiRouting } from '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/routing-admission';
import { ensureActionBudgetDefault } from '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/action-budget-default';
import { textAiSelectionObservationId } from '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import { TextAiRoutingUnavailableError } from '../../../../../src/modules/text-ai/domain/text-ai-routing';

vi.mock(
    '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/routing-admission',
    () => ({ resolveAdminTextAiRouting: vi.fn() }),
);
vi.mock(
    '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/action-budget-default',
    () => ({ ensureActionBudgetDefault: vi.fn() }),
);
vi.mock('../../../../../src/infrastructure/text-ai/text-ai-capacity', () => ({
    hasSentenceCapacityOverlap: vi.fn(async () => false),
    hasTextsCapacityOverlap: vi.fn(async () => false),
    hasConversationCapacityOverlap: vi.fn(async () => false),
}));
vi.mock('../../../../../src/infrastructure/text-ai/text-ai-circuit', () => ({
    isTextAiCircuitOpen: vi.fn(async () => false),
}));
const at = new Date('2026-10-25T10:00:00Z');
const model = textAiModelCatalog[0]!;
function snapshot(): TextAiExecutionSnapshot {
    return {
        ...model,
        modelId: model.id,
        enabledModelIds: [model.id],
        supportedFormats: [...model.supportedFormats],
    };
}
function managed() {
    const base = snapshot();
    return {
        revisionId: 'synthetic-revision',
        snapshot: {
            ...base,
            routingAuthority: {
                revisionId: 'synthetic-revision',
                flowId: 'single-card' as const,
                tariffPublished: true,
                automaticReattemptLimit: 1 as const,
                candidates: [
                    {
                        routeId: `${model.providerId}/${model.id}`,
                        fingerprint: 'synthetic',
                        snapshot: base,
                        providerPrice: {} as never,
                    },
                ],
            },
        },
    };
}
function observation(overrides: Record<string, unknown> = {}) {
    return {
        id: textAiSelectionObservationId('worker', model.providerId, model.id),
        workerId: 'worker',
        providerId: model.providerId,
        modelId: model.id,
        adapterRevision: model.adapterRevision,
        status: 'available',
        textAiSelectionRevision: 1,
        textAiSupportedFormats: ['single-card:v2'],
        ...overrides,
    };
}
function participant(rows: unknown[], enabled = true) {
    const chain = { from: () => chain, where: () => Promise.resolve(rows) };
    const tx = {
        select: () => chain,
        execute: vi.fn(async () => []),
    } as unknown as ConstructorParameters<
        typeof DrizzleTextAiAdmissionParticipant
    >[0];
    return new DrizzleTextAiAdmissionParticipant(tx, {
        routingEnabled: enabled,
        credentialConfigured: () => true,
    });
}
const input = {
    userId: 'learner',
    format: 'single-card:v2',
    now: at,
    legacyBudget: model.aggregateBudget,
};
describe('admin-authorized admission and rolling-worker readiness', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(resolveAdminTextAiRouting).mockResolvedValue(managed());
    });
    it('pins admin routing independently of learner model preferences and initializes only the spending default', async () => {
        const result = await participant([observation()]).resolve(input);
        expect(result.snapshot?.providerId).toBe(model.providerId);
        expect(result.snapshot?.routingAuthority?.revisionId).toBe(
            'synthetic-revision',
        );
        expect(ensureActionBudgetDefault).toHaveBeenCalledWith(
            expect.anything(),
            'learner',
            at,
        );
        expect(resolveAdminTextAiRouting).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ format: input.format, now: at }),
        );
    });
    it('fails closed when routing has not been published', async () => {
        vi.mocked(resolveAdminTextAiRouting).mockResolvedValue(null);
        await expect(
            participant([observation()]).resolve(input),
        ).rejects.toBeInstanceOf(TextAiSelectionUnavailableError);
    });
    it('maps missing reviewed authorization to the learner-safe unavailable error', async () => {
        vi.mocked(resolveAdminTextAiRouting).mockRejectedValue(
            new TextAiRoutingUnavailableError(
                'Internal reviewed tariff missing',
            ),
        );
        await expect(
            participant([observation()]).resolve(input),
        ).rejects.toBeInstanceOf(TextAiSelectionUnavailableError);
    });
    it.each(
        [
            [],
            [observation({ textAiSelectionRevision: null })],
            [observation({ status: 'unavailable' })],
            [observation({ adapterRevision: 'old-adapter' })],
            [observation({ textAiSupportedFormats: ['single-card:v1'] })],
        ].map((rows) => [rows]),
    )(
        'rejects absent or incompatible current worker evidence %#',
        async (rows) => {
            await expect(
                participant(rows).resolve(input),
            ).rejects.toBeInstanceOf(TextAiSelectionUnavailableError);
            expect(ensureActionBudgetDefault).not.toHaveBeenCalled();
        },
    );
    it('does not invoke routing when managed admission is disabled', async () => {
        await expect(
            participant([observation()], false).resolve(input),
        ).rejects.toBeInstanceOf(TextAiSelectionUnavailableError);
        expect(resolveAdminTextAiRouting).not.toHaveBeenCalled();
    });
});
