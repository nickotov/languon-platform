import { z } from 'zod';
import { requireSafe } from './policy.mjs';

const ScenarioSchema = z.enum(['explanation', 'shopping-vocabulary']);
const scenarios = {
    explanation: {
        title: 'Synthetic AI smoke: English greeting',
        context: 'Hello means a greeting in English.',
        explanationLanguage: 'en',
        prompt: 'Give one very short example sentence using hello. Plain text only; do not create notes or use tools.',
        responseKind: 'learning-explanation',
    },
    'shopping-vocabulary': {
        title: 'Synthetic AI smoke: Shopping vocabulary',
        context: 'A shopper buys groceries at a store.',
        explanationLanguage: 'ru',
        prompt: 'Generate one interactive vocabulary block containing exactly 50 distinct common English words used when shopping, with Russian translations. Keep each entry to its term and translation.',
        responseKind: 'generation',
    },
};

export function smokeScenario(name = 'explanation') {
    return Object.freeze(scenarios[ScenarioSchema.parse(name)]);
}

/** Inspect persisted authority; prose claiming successful generation is insufficient. */
export async function verifyScenarioOutput({
    scenario,
    api,
    contracts,
    detail,
    conversationId,
    turnId,
    noteId,
    branch,
}) {
    const config = smokeScenario(scenario);
    requireSafe(
        detail.messages.some(
            (message) =>
                message.turnId === turnId &&
                message.role === 'assistant' &&
                message.status === 'complete' &&
                message.responseMetadata?.kind === config.responseKind,
        ),
        'workspace-routing-unverified',
    );

    if (scenario !== 'shopping-vocabulary') {
        return {};
    }

    const { proposals } = await api.request(
        `/conversations/${conversationId}/block-proposals`,
        contracts.KnowledgeBlockProposalsResponseSchema,
    );
    const proposal = proposals[0];
    requireSafe(
        proposals.length === 1 &&
            proposal.conversationId === conversationId &&
            proposal.turnId === turnId &&
            proposal.noteId === noteId &&
            proposal.branchId === branch.id &&
            proposal.baseBranchVersion === branch.version &&
            proposal.appliedAt === null &&
            proposal.appliedBranchVersion === null &&
            !proposal.target &&
            !proposal.targetStale &&
            !proposal.dependencies?.length &&
            proposal.blocks.length === 1,
        'shopping-proposal-missing-or-mismatched',
    );

    const block = proposal.blocks[0];
    requireSafe(
        block.type === 'vocabulary' &&
            block.language === 'en' &&
            block.translationLanguage === 'ru' &&
            block.entries.length === 50 &&
            new Set(block.entries.map((entry) => entry.id)).size === 50 &&
            new Set(
                block.entries.map((entry) =>
                    entry.term.normalize('NFKC').trim().toLocaleLowerCase('en'),
                ),
            ).size === 50,
        'shopping-vocabulary-incomplete-or-duplicate',
    );

    return { generatedVocabularyEntries: 50 };
}
