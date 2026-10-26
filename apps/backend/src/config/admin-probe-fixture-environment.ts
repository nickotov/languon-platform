import { z } from 'zod';
import {
    parseEnvironmentSchema,
    type EnvironmentDiagnostics,
} from './environment-diagnostics';

/** Deliberately restricted to the existing disposable administration E2E host. */
export function adminProbeFixtureEnabled(
    values: NodeJS.ProcessEnv = process.env,
    diagnostics: EnvironmentDiagnostics = console,
): boolean {
    const parsed = parseEnvironmentSchema(
        z.object({
            ADMIN_E2E_SYNTHETIC_PROBES: z.enum(['true', 'false']).optional(),
        }),
        values,
        diagnostics,
    );
    if (parsed.ADMIN_E2E_SYNTHETIC_PROBES !== 'true') return false;
    const url = new URL(values.DATABASE_URL ?? '');
    if (
        !['development', 'test'].includes(values.APP_ENV ?? '') ||
        values.NODE_ENV === 'production' ||
        !['localhost', '127.0.0.1'].includes(url.hostname) ||
        !url.port ||
        url.port === '5432' ||
        !/(?:admin.*e2e|e2e.*admin).*test/i.test(url.pathname) ||
        url.search ||
        url.hash ||
        values.DEEPSEEK_API_KEY !== 'synthetic-test-key'
    ) {
        throw new Error(
            'Synthetic admin probes require a dedicated disposable admin E2E database and synthetic credentials.',
        );
    }
    return true;
}
