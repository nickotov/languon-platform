import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { databaseSchema } from '../../../src/infrastructure/database/schema';
import { ensureActionBudgetDefault } from '../../../src/modules/text-ai/infrastructure/persistence/drizzle/action-budget-default';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'copied learner action budget',
    () => {
        let client: PostgresClient;
        let owner: string;
        const database = () => createDrizzleDatabase(client, databaseSchema);
        beforeAll(async () => {
            client = createTestPostgresClient();
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        }, 120000);
        afterAll(async () => {
            await client?.end();
        });
        beforeEach(async () => {
            await client`truncate users,ai_accounting_settings_revisions cascade`;
            owner = randomUUID();
            await client`insert into users(id,status) values(${owner},'active')`;
            await client`insert into ai_accounting_settings_revisions(id,version,default_max_credits_per_action,reason,created_at) values(${randomUUID()},1,'1','Synthetic budget default',now())`;
        });
        const copy = () =>
            database().transaction((tx) =>
                ensureActionBudgetDefault(tx, owner, new Date()),
            );
        it('copies once and preserves that value after an administrator raises the default', async () => {
            expect((await copy())?.maxCreditsPerAction).toBe('1');
            await client`insert into ai_accounting_settings_revisions(id,version,default_max_credits_per_action,reason,created_at) values(${randomUUID()},2,'100','Synthetic changed default',now())`;
            expect((await copy())?.maxCreditsPerAction).toBe('1');
            const [stored] =
                await client`select max_credits_per_action,version from user_text_ai_preferences where user_id=${owner}`;
            expect(stored).toMatchObject({
                max_credits_per_action: '1',
                version: 1,
            });
        });
        it('concurrent first admissions converge without repeatedly raising the preference version', async () => {
            const results = await Promise.all([copy(), copy(), copy()]);
            expect(results.map((row) => row?.maxCreditsPerAction)).toEqual([
                '1',
                '1',
                '1',
            ]);
            expect(results.map((row) => row?.version)).toEqual([1, 1, 1]);
        });
        it('preserves an explicit learner setting and selected model', async () => {
            await client`insert into user_text_ai_preferences(user_id,mode,model_id,version,max_credits_per_action) values(${owner},'explicit','deepseek-flash',7,'0.125')`;
            expect(await copy()).toMatchObject({
                mode: 'explicit',
                modelId: 'deepseek-flash',
                version: 7,
                maxCreditsPerAction: '0.125',
            });
        });
    },
);
