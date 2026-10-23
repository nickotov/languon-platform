import { sql, type SQL } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';

type Database = PostgresJsDatabase<typeof databaseSchema>;
export type ConversationDeletionTransaction = Parameters<
    Parameters<Database['transaction']>[0]
>[0];
export type ConversationDeletionScope =
    | { ownerId: string }
    | {
          sourceKind: 'dictionary' | 'text' | 'knowledge';
          sourceIds: readonly string[];
      }
    | { conversationIds: readonly string[] };

function scopePredicate(scope: ConversationDeletionScope): SQL {
    if ('ownerId' in scope)
        return sql`(c.owner_id=${scope.ownerId}::uuid
        or (c.source_kind='dictionary' and c.source_id in (select id from dictionaries where owner_id=${scope.ownerId}::uuid))
        or (c.source_kind='text' and c.source_id in (select id from texts where owner_id=${scope.ownerId}::uuid))
        or (c.source_kind='knowledge' and c.source_id in (select id from knowledge_notes where owner_id=${scope.ownerId}::uuid)))`;
    if ('conversationIds' in scope)
        return scope.conversationIds.length
            ? sql`c.id in (${sql.join(
                  scope.conversationIds.map((id) => sql`${id}::uuid`),
                  sql`,`,
              )})`
            : sql`false`;

    return scope.sourceIds.length
        ? sql`c.source_kind=${scope.sourceKind} and c.source_id in (${sql.join(
              scope.sourceIds.map((id) => sql`${id}::uuid`),
              sql`,`,
          )})`
        : sql`false`;
}

/** Caller acquires the common capacity fence before source/user locks. Do not
 * settle another learner's credit while holding the source owner's row lock. */
export async function requestConversationCancellation(
    tx: ConversationDeletionTransaction,
    scope: ConversationDeletionScope,
    now: Date,
): Promise<void> {
    await tx.execute(sql`update conversation_turns t set cancel_requested=true, updated_at=${now.toISOString()}::timestamptz
        from conversation_chats c where c.id=t.conversation_id and (${scopePredicate(scope)}) and t.status in ('queued','running')`);
}

/** Only identities, lifecycle and numerical accounting are read by purge. A
 * terminal response does not imply its provider hold has been settled. */
export async function conversationDeletionBusy(
    tx: ConversationDeletionTransaction,
    scope: ConversationDeletionScope,
    now = new Date(),
): Promise<boolean> {
    const rows =
        await tx.execute(sql`select 1 from conversation_chats c join conversation_turns t on t.conversation_id=c.id
        where (${scopePredicate(scope)}) and (t.status in ('queued','running') or t.lease_until>${now.toISOString()}::timestamptz
            or exists(select 1 from ai_credit_actions a where a.id=t.id and a.state='active')
            or exists(select 1 from ai_credit_reservations r where r.job_id=t.id and r.job_kind='conversation-turn' and r.state='active')
            or exists(select 1 from conversation_provider_calls p where p.turn_id=t.id and
                (p.state<>'settled' or exists(select 1 from ai_credit_reservations r where r.id=p.reservation_id and r.state='active')))) limit 1`);

    return rows.length > 0;
}

/** Archive numerical provider usage before deleting content. The actor's daily
 * budget survives source/chat deletion; no input, output or source identity is
 * copied to the archive. All SDK memory, drafts and replay events cascade. */
export async function eraseConversationContent(
    tx: ConversationDeletionTransaction,
    scope: ConversationDeletionScope,
    now: Date,
): Promise<void> {
    if (await conversationDeletionBusy(tx, scope, now))
        throw new Error('Conversation work is not quiescent');
    const turns = sql`select t.id from conversation_turns t join conversation_chats c on c.id=t.conversation_id where (${scopePredicate(scope)})`;
    await tx.execute(sql`insert into dictionary_generation_provider_usage_archive (
        id,job_kind,owner_id,actual_cost_micros,actual_input_tokens,actual_output_tokens,
        input_cost_micros_per_million_tokens,output_cost_micros_per_million_tokens,
        max_cost_micros_per_attempt,max_input_tokens_per_attempt,max_output_tokens_per_attempt,settled_at,archived_at
    ) select p.id,'conversation-turn',p.owner_id,p.actual_cost_micros,p.actual_input_tokens,p.actual_output_tokens,
        p.input_cost_micros_per_million_tokens,p.output_cost_micros_per_million_tokens,
        p.max_cost_micros_per_attempt,p.max_input_tokens_per_attempt,p.max_output_tokens_per_attempt,p.settled_at,${now.toISOString()}::timestamptz
        from conversation_provider_calls p where p.turn_id in (${turns}) and p.state='settled'
            and p.settled_at>${new Date(now.getTime() - 86_400_000).toISOString()}::timestamptz on conflict(id) do nothing`);

    await tx.execute(
        sql`delete from conversation_provider_calls where turn_id in (${turns})`,
    );

    await tx.execute(
        sql`delete from conversation_chats c where (${scopePredicate(scope)})`,
    );
}

export async function eraseConversationSource(
    tx: ConversationDeletionTransaction,
    kind: 'dictionary' | 'text' | 'knowledge',
    id: string,
    now = new Date(),
): Promise<void> {
    await eraseConversationContent(
        tx,
        { sourceKind: kind, sourceIds: [id] },
        now,
    );
}

export async function eraseOwnerConversations(
    tx: ConversationDeletionTransaction,
    ownerId: string,
    now: Date,
): Promise<void> {
    await eraseConversationContent(tx, { ownerId }, now);
    await tx.execute(
        sql`delete from conversation_settings where owner_id=${ownerId}::uuid`,
    );
}
