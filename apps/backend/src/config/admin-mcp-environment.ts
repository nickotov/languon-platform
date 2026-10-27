import { z } from 'zod';
import {
    parseEnvironmentSchema,
    type EnvironmentDiagnostics,
} from './environment-diagnostics';
const schema = z.object({
    APP_ENV: z.enum(['development', 'test']),
    DATABASE_URL: z.url().refine((value) => {
        const url = new URL(value);
        return (
            ['postgres:', 'postgresql:'].includes(url.protocol) &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        );
    }, 'Local MCP requires a loopback PostgreSQL database.'),
    ADMIN_MCP_PORT: z.coerce.number().int().min(1024).max(65535).default(3002),
    ADMIN_MCP_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(5).default(2),
});
/** Explicitly local-only; production/staging cannot start this listener. */
export function loadAdminMcpEnvironment(
    values: NodeJS.ProcessEnv = process.env,
    diagnostics: EnvironmentDiagnostics = console,
) {
    return parseEnvironmentSchema(schema, values, diagnostics);
}
