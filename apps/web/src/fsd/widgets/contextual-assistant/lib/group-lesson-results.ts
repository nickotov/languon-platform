import type {
    ConversationTurn,
    GenerationRunSummary,
    KnowledgeContentProposal,
} from '@languon/contracts';
import type { ConversationUIMessage } from '@/fsd/entities/conversation';

/** A completed lesson belongs to the assistant turn that published its proposal.
 * Older proposals can fall outside the loaded list; their turn still carries the publication tool receipt. */
export function groupLessonResults(
    runs: readonly GenerationRunSummary[],
    messages: readonly ConversationUIMessage[],
    turns: ReadonlyMap<string, ConversationTurn>,
    proposals: readonly KnowledgeContentProposal[],
) {
    const byTurn = new Map<
        string,
        { run: GenerationRunSummary; proposal?: KnowledgeContentProposal }
    >();
    const remaining: GenerationRunSummary[] = [];
    if (!runs.length) {
        return { byTurn, remaining };
    }

    const answeredTurns = new Set<string>();
    const publishedTurns = new Map<string, string>();
    for (const message of messages) {
        const turnId = message.metadata?.turnId;
        if (message.role !== 'assistant' || !turnId) {
            continue;
        }

        answeredTurns.add(turnId);
        const runId = turns.get(turnId)?.generationRunId;
        if (
            runId &&
            message.metadata?.toolCalls.some(
                (call) =>
                    call.name === 'propose_learning_content' &&
                    call.state === 'succeeded',
            )
        ) {
            publishedTurns.set(runId, turnId);
        }
    }

    const listed = new Map(
        proposals
            .filter((proposal) => proposal.isCompletedLesson)
            .map((proposal) => [proposal.id, proposal]),
    );

    for (const run of runs) {
        const proposal =
            run.state === 'completed' && run.proposalId
                ? listed.get(run.proposalId)
                : undefined;
        const turnId =
            run.state === 'completed' &&
            (proposal?.turnId ?? publishedTurns.get(run.id));

        if (turnId && answeredTurns.has(turnId)) {
            byTurn.set(turnId, { run, ...(proposal && { proposal }) });
        } else {
            remaining.push(run);
        }
    }

    return { byTurn, remaining };
}
