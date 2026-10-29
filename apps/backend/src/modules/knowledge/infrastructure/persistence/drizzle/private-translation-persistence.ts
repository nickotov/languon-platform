import { sql } from 'drizzle-orm';
import {
    TextTranslationProposalSchema,
    type TextTranslationProposal,
} from '@languon/contracts';
import type { KnowledgeLearningSourceBinding } from '../../../application/learning-source-binding';
import type { KnowledgeTransaction } from './knowledge-transaction';
import { knowledgeUnavailable } from './knowledge-transaction';
import { readPinnedKnowledgeLearningSource } from './learning-source-binding';
import { knowledgeTextJobSourcesTable as sources } from './private-translation-schema';

/** The source tag remains on the parent even after note deletion cascades this link. */
export async function authorizeKnowledgeTranslationJobSource(
    tx: KnowledgeTransaction,
    input: {
        ownerId: string;
        id?: string;
        externalSourceKind?: 'knowledge-block' | null;
        knowledgeSource?: KnowledgeLearningSourceBinding;
    },
) {
    if (!input.knowledgeSource && input.externalSourceKind) {
        if (!input.id) throw knowledgeUnavailable();
        const available = await tx.execute(
            sql`select languon_knowledge_job_source_available(${input.id}::uuid,'text-translation',${input.ownerId}::uuid) as available`,
        );

        if (available[0]?.available !== true) throw knowledgeUnavailable();

        return;
    }

    const binding = input.knowledgeSource;
    if (!binding) return;
    if (
        binding.actorId !== input.ownerId ||
        binding.sourceSnapshot.type !== 'bilingual-text'
    )
        throw knowledgeUnavailable();
    await readPinnedKnowledgeLearningSource(tx, binding);
}

export async function attachKnowledgeTranslationJob(
    tx: KnowledgeTransaction,
    actorId: string,
    jobId: string,
    binding: KnowledgeLearningSourceBinding,
    requestedTargetLanguage: string,
) {
    if (
        binding.actorId !== actorId ||
        binding.sourceSnapshot.type !== 'bilingual-text'
    )
        throw knowledgeUnavailable();
    const pinned = await readPinnedKnowledgeLearningSource(tx, binding);
    if (
        pinned.block.type !== 'bilingual-text' ||
        pinned.block.translations.some(
            (translation) =>
                translation.language.toLowerCase() ===
                requestedTargetLanguage.toLowerCase(),
        )
    )
        throw knowledgeUnavailable();
    await tx.insert(sources).values({
        jobId,
        actorId,
        noteId: binding.noteId,
        blockId: binding.blockId,
        binding,
        requestedTargetLanguage,
    });
}

/** Private completion authority is minted in the claim transaction, never selected. */
export async function claimPrivateKnowledgeTranslation(
    tx: KnowledgeTransaction,
    jobId: string,
    lease: { workerId: string; fencingToken: string },
): Promise<string> {
    const result = await tx.execute(
        sql`select languon_issue_private_translation_lease(${jobId}::uuid,${lease.workerId},${lease.fencingToken}::bigint) as token`,
    );

    if (typeof result[0]?.token !== 'string') throw knowledgeUnavailable();

    return result[0].token;
}

export async function publishPrivateKnowledgeTranslation(
    tx: KnowledgeTransaction,
    jobId: string,
    actorId: string,
    proposal: TextTranslationProposal,
    lease: {
        workerId: string;
        fencingToken: string;
        privateCompletionToken?: string;
    },
) {
    if (!lease.privateCompletionToken) throw knowledgeUnavailable();
    await tx.execute(
        sql`select languon_complete_private_knowledge_translation(${jobId}::uuid,${actorId}::uuid,${lease.workerId},${lease.fencingToken}::bigint,${lease.privateCompletionToken}::uuid,${JSON.stringify(proposal)}::jsonb)`,
    );
}

export async function renewPrivateKnowledgeTranslation(
    tx: KnowledgeTransaction,
    lease: {
        jobId: string;
        workerId: string;
        fencingToken: string;
        privateCompletionToken?: string;
    },
) {
    if (!lease.privateCompletionToken) throw knowledgeUnavailable();
    await tx.execute(
        sql`select languon_renew_private_translation_lease(${lease.jobId}::uuid,${lease.workerId},${lease.fencingToken}::bigint,${lease.privateCompletionToken}::uuid)`,
    );
}

/** Called only after the API has resolved the authenticated actor's live source.
 * Worker credentials cannot SELECT this hidden receipt or execute a hydration definer. */
export async function readPrivateKnowledgeTranslationResult(
    tx: KnowledgeTransaction,
    jobId: string,
    actorId: string,
) {
    const available = await tx.execute(
        sql`select languon_knowledge_job_source_available(${jobId}::uuid,'text-translation',${actorId}::uuid) as available`,
    );

    if (available[0]?.available !== true) throw knowledgeUnavailable();
    const rows = await tx.execute(
        sql`select result_payload from knowledge_translation_publication_receipts r where r.job_id=${jobId}::uuid and r.actor_id=${actorId}::uuid and exists(select 1 from texts_ai_jobs j where j.id=r.job_id and j.owner_id=r.actor_id and j.execution_state='completed' and j.cancellation_requested_at is null and r.retention_deadline>clock_timestamp())`,
    );

    return TextTranslationProposalSchema.parse(rows[0]?.result_payload);
}
