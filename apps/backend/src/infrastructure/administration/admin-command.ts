import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

import { AdminReasonSchema, EmailSchema } from '@languon/contracts';
import { createDrizzleDatabase, createPostgresClient } from '@languon/database';
import { z } from 'zod';

import { loadEnvironment } from '../../config/environment';
import { databaseSchema } from '../database/schema';
import { DrizzleAdministrationOperator } from '../../modules/administration/infrastructure/persistence/drizzle/drizzle-administration-operator';

const confirmation = 'admin-membership-change';
const MutatingCommandSchema = z
    .object({
        actorEmail: EmailSchema.optional(),
        confirm: z.literal(confirmation),
        email: EmailSchema,
        reason: AdminReasonSchema,
    })
    .strict();
const PruneCommandSchema = z
    .object({
        actorEmail: EmailSchema,
        confirm: z.literal(confirmation),
        reason: AdminReasonSchema,
    })
    .strict();

export type AdministrationCommand =
    | { command: 'list' }
    | {
          actorEmail?: string;
          command: 'grant' | 'revoke';
          confirm: typeof confirmation;
          email: string;
          reason: string;
      }
    | {
          actorEmail: string;
          command: 'prune';
          confirm: typeof confirmation;
          reason: string;
      };

export function parseAdministrationCommand(
    arguments_: string[],
): AdministrationCommand {
    const [command, ...tokens] = withoutPnpmSeparator(arguments_);
    if (!['grant', 'list', 'prune', 'revoke'].includes(command ?? '')) {
        throw new Error(
            'Usage: admin-command <grant|revoke|list|prune> [--email value] [--actor-email value] [--reason value] [--confirm admin-membership-change]',
        );
    }
    const values = parseFlags(tokens);
    if (command === 'list') {
        if (Object.keys(values).length) {
            throw new Error('The list command does not accept options.');
        }
        return { command } as const;
    }
    if (command === 'prune') {
        const parsed = PruneCommandSchema.parse(values);
        if (!parsed.actorEmail) throw new Error('Actor email is required.');
        return { ...parsed, actorEmail: parsed.actorEmail, command };
    }
    const parsed = MutatingCommandSchema.parse(values);
    return {
        ...(parsed.actorEmail ? { actorEmail: parsed.actorEmail } : {}),
        command: command as 'grant' | 'revoke',
        confirm: parsed.confirm,
        email: parsed.email,
        reason: parsed.reason,
    };
}

export function readsAdministrationRequestFromStandardInput(
    arguments_: string[],
): boolean {
    const normalized = withoutPnpmSeparator(arguments_);
    return normalized.length === 1 && normalized[0] === '--request-stdin';
}

export function parseAdministrationRequest(
    input: unknown,
): AdministrationCommand {
    const envelope = z
        .object({ command: z.enum(['grant', 'list', 'prune', 'revoke']) })
        .passthrough()
        .parse(input);
    if (envelope.command === 'list') {
        return z
            .object({ command: z.literal('list') })
            .strict()
            .parse(input);
    }
    if (envelope.command === 'prune') {
        return {
            ...PruneCommandSchema.extend({ command: z.literal('prune') })
                .strict()
                .parse(input),
        };
    }
    const parsed = MutatingCommandSchema.extend({
        command: z.enum(['grant', 'revoke']),
    })
        .strict()
        .parse(input);
    return {
        ...(parsed.actorEmail ? { actorEmail: parsed.actorEmail } : {}),
        command: parsed.command,
        confirm: parsed.confirm,
        email: parsed.email,
        reason: parsed.reason,
    };
}

async function main() {
    const localEnvironmentFile = new URL(
        '../../../../../.env.local',
        import.meta.url,
    );
    if (existsSync(localEnvironmentFile)) loadEnvFile(localEnvironmentFile);
    const commandArguments = process.argv.slice(2);
    const input = readsAdministrationRequestFromStandardInput(commandArguments)
        ? parseAdministrationRequest(
              JSON.parse(await readStandardInput(8 * 1024)),
          )
        : parseAdministrationCommand(commandArguments);
    const environment = loadEnvironment();
    const sql = createPostgresClient({
        databaseUrl: environment.DATABASE_URL,
        maxConnections: 1,
    });
    try {
        const operator = new DrizzleAdministrationOperator(
            createDrizzleDatabase(sql, databaseSchema),
        );
        const now = new Date();
        let result: unknown;
        if (input.command === 'list') {
            result = await operator.list();
        } else if (input.command === 'prune') {
            result = await operator.prune({
                actorEmail: input.actorEmail,
                now,
                reason: input.reason,
            });
        } else {
            const mutation = {
                ...(input.actorEmail ? { actorEmail: input.actorEmail } : {}),
                email: input.email,
                now,
                reason: input.reason,
            };
            result =
                input.command === 'grant'
                    ? await operator.grant(mutation)
                    : await operator.revoke(mutation);
        }
        console.log(
            JSON.stringify({ command: input.command, result }, null, 2),
        );
    } finally {
        await sql.end();
    }
}

function withoutPnpmSeparator(arguments_: string[]): string[] {
    return arguments_[0] === '--' ? arguments_.slice(1) : arguments_;
}

async function readStandardInput(maximumBytes: number): Promise<string> {
    let result = '';
    for await (const chunk of process.stdin) {
        result += String(chunk);
        if (Buffer.byteLength(result) > maximumBytes) {
            throw new Error('Administration request exceeds 8 KiB.');
        }
    }
    if (!result.trim()) throw new Error('Administration request is empty.');
    return result;
}

function parseFlags(tokens: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (let index = 0; index < tokens.length; index += 2) {
        const flag = tokens[index];
        const value = tokens[index + 1];
        if (!flag?.startsWith('--') || !value || value.startsWith('--')) {
            throw new Error(`Invalid option near ${flag ?? 'end of command'}.`);
        }
        const key = flag
            .slice(2)
            .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
        if (!['actorEmail', 'confirm', 'email', 'reason'].includes(key)) {
            throw new Error(`Unknown option ${flag}.`);
        }
        if (result[key]) throw new Error(`Duplicate option ${flag}.`);
        result[key] = value;
    }
    return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error: unknown) => {
        console.error(
            error instanceof Error ? error.message : 'Command failed.',
        );
        process.exitCode = 1;
    });
}
