import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function expectedMigrations(root) {
    const folder = resolve(root, 'apps/backend/drizzle');
    const journal = JSON.parse(
        await readFile(resolve(folder, 'meta/_journal.json'), 'utf8'),
    );
    return Promise.all(
        journal.entries.map(async (entry) => ({
            created_at: String(entry.when),
            hash: createHash('sha256')
                .update(await readFile(resolve(folder, `${entry.tag}.sql`)))
                .digest('hex'),
        })),
    );
}

export function migrationStatus(applied, expected) {
    if (
        applied.some(
            (entry, index) =>
                entry.hash !== expected[index]?.hash ||
                String(entry.created_at) !== expected[index]?.created_at,
        )
    ) {
        return {
            id: 'migrations',
            status: 'blocked',
            message:
                'Database migration history differs from checked-in history. Preserve the database and review the development cutover guide; do not reset automatically.',
        };
    }
    return applied.length === expected.length
        ? {
              id: 'migrations',
              status: 'pass',
              message: 'Database migration hashes match the current checkout.',
          }
        : {
              id: 'migrations',
              status: 'blocked',
              message: `${expected.length - applied.length} migrations pending. Run pnpm db:migrate against the intended local database.`,
          };
}

export async function readSnapshot(sql, learnerEmail) {
    const [configuration] =
        await sql`select r.catalog_snapshot as snapshot from dictionary_ai_configuration c join dictionary_ai_configuration_revisions r on r.id=c.active_revision_id`;
    const prices =
        await sql`select distinct on (provider_id,model_id) provider_id,model_id,data from ai_provider_price_revisions where meter='text-tokens' and effective_at<=now() order by provider_id,model_id,effective_at desc,version desc`;
    const tariffs =
        await sql`select distinct on (provider_id,model_id) provider_id,model_id,rates from model_price_revisions where meter='text-tokens' order by provider_id,model_id,version desc`;
    const [settings] =
        await sql`select default_max_credits_per_action,max_provider_cost_usd_per_action,max_provider_cost_usd_per_account_day,max_provider_cost_usd_per_day from ai_accounting_settings_revisions order by version desc limit 1`;
    const workers =
        await sql`select id,worker_id,model_id,provider_id,adapter_revision,status,text_ai_selection_revision,text_ai_capacity_revision,texts_capacity_revision,texts_execution_revision,conversation_capacity_revision,conversation_execution_revision,learning_execution_revision,credit_settlement_revision,text_ai_supported_formats from dictionary_ai_worker_observations where expires_at>now()`;
    const policies =
        await sql`select distinct on (capability) capability,funding from ai_capability_policy_revisions order by capability,version desc`;
    let learner;
    if (learnerEmail) {
        [learner] = await sql`select p.mode,p.model_id,p.max_credits_per_action,
            (a.mode='unlimited' and (a.unlimited_until is null or a.unlimited_until>now())) as unlimited,
            (select coalesce(sum(b.remaining_credits),0)::text from ai_credit_grant_balances b where b.owner_id=e.user_id and b.remaining_credits>0 and (b.expires_at is null or b.expires_at>now())) as available_milli
            from user_emails e left join user_text_ai_preferences p on p.user_id=e.user_id
            left join ai_credit_accounts a on a.user_id=e.user_id where e.canonical_email=${learnerEmail.trim().toLowerCase()} and e.is_primary`;
    }
    return {
        configuration: configuration?.snapshot,
        prices,
        tariffs,
        settings,
        workers,
        policies,
        learner,
        learnerRequested: Boolean(learnerEmail),
    };
}
