import { z } from 'zod';
import {
    parseEnvironmentSchema,
    type EnvironmentDiagnostics,
} from './environment-diagnostics';
import type { TextAiProbeLimits } from '../modules/text-ai/application/ports/text-ai-probe-store';

const positiveMicros = z.coerce.number().int().positive().max(1_000_000_000);
const schema = z.object({
    AI_ADMIN_PROBE_MAX_COST_MICROS: positiveMicros.default(10_000),
    AI_ADMIN_PROBE_DAILY_MAX_COST_MICROS: positiveMicros.default(100_000),
    AI_ADMIN_PROBE_COOLDOWN_SECONDS: z.coerce
        .number()
        .int()
        .min(1)
        .max(3600)
        .default(10),
    AI_ADMIN_PROBE_EVIDENCE_HOURS: z.coerce
        .number()
        .int()
        .min(1)
        .max(168)
        .default(24),
    AI_ADMIN_PROBE_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .min(1000)
        .max(180_000)
        .default(30_000),
});

/** API-process only. Defaults are logged by the unified environment parser. */
export function loadTextAiProbeEnvironment(
    values: NodeJS.ProcessEnv = process.env,
    diagnostics: EnvironmentDiagnostics = console,
): { limits: TextAiProbeLimits; timeoutMs: number } {
    const parsed = parseEnvironmentSchema(schema, values, diagnostics);
    return {
        limits: {
            maximumCostMicros: BigInt(parsed.AI_ADMIN_PROBE_MAX_COST_MICROS),
            dailyMaximumCostMicros: BigInt(
                parsed.AI_ADMIN_PROBE_DAILY_MAX_COST_MICROS,
            ),
            cooldownSeconds: parsed.AI_ADMIN_PROBE_COOLDOWN_SECONDS,
            evidenceHours: parsed.AI_ADMIN_PROBE_EVIDENCE_HOURS,
        },
        timeoutMs: parsed.AI_ADMIN_PROBE_TIMEOUT_MS,
    };
}
