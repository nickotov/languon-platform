import { randomUUID } from 'node:crypto';
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import type {
    ProviderPrice,
    ProviderPricePublishRequest,
} from '@languon/contracts';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { AccountingConflictError } from '../../../domain/accounting';
import { aiProviderPriceRevisionsTable as prices } from './provider-price-schema';

type Database = PostgresJsDatabase<typeof databaseSchema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const dto = (row: typeof prices.$inferSelect): ProviderPrice => ({
    ...row.data,
    id: row.id,
    version: row.version,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    effectiveAt: row.effectiveAt.toISOString(),
});

export class DrizzleProviderPriceStore {
    constructor(private readonly database: Database) {}
    async list(): Promise<ProviderPrice[]> {
        return this.listInTransaction(this.database);
    }

    async listInTransaction(
        tx: Pick<Transaction, 'selectDistinctOn'>,
    ): Promise<ProviderPrice[]> {
        // Latest publication per provider/model/meter, including scheduled revisions; admission resolves effectiveAt independently.
        const rows = await tx
            .selectDistinctOn([prices.providerId, prices.modelId, prices.meter])
            .from(prices)
            .orderBy(
                prices.providerId,
                prices.modelId,
                prices.meter,
                desc(prices.version),
            );

        return rows.map(dto);
    }

    async publish(
        input: ProviderPricePublishRequest,
        actorId: string,
        at: Date,
    ): Promise<ProviderPrice> {
        return this.database.transaction((tx) =>
            this.publishInTransaction(tx, input, actorId, at),
        );
    }

    /** Participates in an authorized caller's transaction and replay boundary. */
    async publishInTransaction(
        tx: Transaction,
        input: ProviderPricePublishRequest,
        actorId: string,
        at: Date,
    ): Promise<ProviderPrice> {
        await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`provider-price:${input.providerId}:${input.modelId}:${input.meter}`},0))`,
        );

        const [latest] = await tx
            .select()
            .from(prices)
            .where(
                and(
                    eq(prices.providerId, input.providerId),
                    eq(prices.modelId, input.modelId),
                    eq(prices.meter, input.meter),
                ),
            )
            .orderBy(desc(prices.version))
            .limit(1);

        if ((latest?.version ?? 0) !== input.expectedVersion)
            throw new AccountingConflictError(
                'Provider price revision changed.',
            );
        const { expectedVersion, ...data } = input;
        const [saved] = await tx
            .insert(prices)
            .values({
                id: randomUUID(),
                providerId: input.providerId,
                modelId: input.modelId,
                meter: input.meter,
                version: expectedVersion + 1,
                effectiveAt: new Date(input.effectiveAt),
                createdAt: at,
                createdBy: actorId,
                data,
            })
            .returning();

        if (!saved) throw new Error('Provider price publication failed.');

        return dto(saved);
    }
}

/** Lock-free lookup: serialize this complete immutable value into the action at admission. Never re-read on settlement. */
export async function pinProviderPrice(
    tx: Transaction,
    input: {
        providerId: string;
        modelId: string;
        meter:
            | 'text-tokens'
            | 'speech-characters'
            | 'speech-tokens'
            | 'audio-duration';
        at: Date;
    },
): Promise<ProviderPrice | null> {
    const [row] = await tx
        .select()
        .from(prices)
        .where(
            and(
                eq(prices.providerId, input.providerId),
                eq(prices.modelId, input.modelId),
                eq(prices.meter, input.meter),
                lte(prices.effectiveAt, input.at),
            ),
        )
        .orderBy(desc(prices.effectiveAt), desc(prices.version))
        .limit(1);

    // Execution snapshots cross account lifetimes; retain numerical provenance,
    // never copy an administrator identity or free-text review metadata into another owner's job.
    return row
        ? {
              ...dto(row),
              createdBy: null,
              reason: 'Pinned numerical provider price',
              sourceReference: `reviewed-rate:${row.id}`,
              sourceUrl: null,
          }
        : null;
}
