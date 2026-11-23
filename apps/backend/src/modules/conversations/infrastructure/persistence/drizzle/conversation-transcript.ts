import { sql } from 'drizzle-orm';
import {
    generationRunActionsTable as actions,
    generationRunsTable as runs,
} from './conversation-generation-schema';
import { conversationMessagesTable as messages } from './schema';

/**
 * The worker stores every stage as a turn for leases, accounting and retries.
 * Only an admitted continuation has a server-built generation envelope. The
 * initial learner message and typed plan revisions remain part of the chat.
 * A generation stage has a conversational answer once it publishes a proposal.
 */
export function transcriptMessage() {
    return sql<boolean>`not exists (
        select 1 from ${actions} join ${runs} on ${runs.id} = ${actions.runId}
        where ${actions.turnId} = ${messages.turnId}
          and ${actions.kind} = 'generation'
          and (
            (${messages.role} = 'user' and
                ${messages.modelContent} #>> '{0,modelContent,generationRun,purpose}' = 'generation')
            or (${messages.role} = 'assistant' and (
                ${runs.proposalId} is null or ${actions.proposalId} is distinct from ${runs.proposalId}
            ))
          )
    )`;
}
