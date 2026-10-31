import { randomUUID } from 'node:crypto';
import { desc } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../src/infrastructure/database/schema';
import {
    maximumActionChargeNumerator,
    roundActionChargeMilli,
    type ActionTariff,
} from '../../src/modules/ai-credits/domain/action-pricing';
import { formatCreditMilli } from '../../src/modules/ai-credits/domain/exact-credit-amount';
import { aiAccountingSettingsRevisionsTable as settings } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import {
    textAiModelCatalog,
    type TextAiModelDefinition,
} from '../../src/modules/text-ai/application/text-ai-provider-catalog';
import { seedLegacyActionFixture } from './legacy-action-fixture';
import { seedTextAiRoutingFixture } from './text-ai-routing-fixture';

/** A finite synthetic allowance for a complete bounded tutor action, including tools/memory. */
export function contextualAssistantFixtureAllowance(
    model: Pick<TextAiModelDefinition, 'aggregateBudget'>,
    tariff: ActionTariff,
): string {
    return formatCreditMilli(
        roundActionChargeMilli(
            maximumActionChargeNumerator(
                {
                    inputTokens: model.aggregateBudget.maxInputTokensPerAttempt,
                    outputTokens:
                        model.aggregateBudget.maxOutputTokensPerAttempt,
                },
                tariff,
            ),
        ),
    );
}

/** Keep real customer accounting; calibrate only this composed journey's synthetic action limit. */
export async function seedContextualAssistantAccountingFixture(
    db: PostgresJsDatabase<typeof databaseSchema>,
) {
    await seedLegacyActionFixture(db);
    // Existing routing is retained, but prompt/tool contract changes require fresh
    // synthetic readiness evidence matching the release fingerprint.
    const routing = await seedTextAiRoutingFixture(db, { refreshProbes: true });
    const model = textAiModelCatalog.find(
        (item) => item.id === 'deepseek-flash',
    );
    if (!model) throw new Error('The contextual fixture model is unavailable.');
    const tariff = routing.configuration.flowTariffs.conversation;
    const [previous] = await db
        .select()
        .from(settings)
        .orderBy(desc(settings.version))
        .limit(1);
    if (!tariff || !previous)
        throw new Error(
            'The synthetic contextual accounting fixture is incomplete.',
        );
    const allowance = contextualAssistantFixtureAllowance(model, {
        inputCreditsPerMillionTokens: String(
            tariff.inputCreditsPerMillionTokens,
        ),
        outputCreditsPerMillionTokens: String(
            tariff.outputCreditsPerMillionTokens,
        ),
        cachedInputCreditsPerMillionTokens:
            tariff.cachedInputCreditsPerMillionTokens == null
                ? null
                : String(tariff.cachedInputCreditsPerMillionTokens),
    });
    if (previous.defaultMaxCreditsPerAction !== allowance)
        await db.insert(settings).values({
            ...previous,
            id: randomUUID(),
            version: previous.version + 1,
            defaultMaxCreditsPerAction: allowance,
            reason: 'Synthetic tutor allowance derived from selected aggregate token bounds and seeded tariff',
        });
}
