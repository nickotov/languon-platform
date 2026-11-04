import type { LearningBlock } from '@languon/contracts';
import type { TutorRunInput } from '../../application/ports/tutor-runner';
import type { TutorRequestState } from '../../application/tutor-request-contract';

type Descriptor = TutorRequestState['proposals'][number];

export function describeLearningProposal(
    id: string,
    blocks: readonly LearningBlock[],
    summary: string,
    ordinal: number,
): Descriptor {
    const allTerms = blocks.flatMap((block) =>
        block.type === 'vocabulary'
            ? block.entries.map((entry) => entry.term)
            : [],
    );
    const terms: string[] = [];
    let length = 0;
    for (const term of allTerms) {
        if (terms.length >= 20 || length + term.length > 1_600) {
            break;
        }

        terms.push(term);
        length += term.length;
    }

    return {
        id,
        summary,
        ordinal,
        kinds: [...new Set(blocks.map((block) => block.type))],
        titles: blocks
            .flatMap((block) =>
                block.title ? [block.title.slice(0, 200)] : [],
            )
            .slice(0, 8),
        terms,
        termsComplete: terms.length === allTerms.length,
    };
}

export async function loadLearningProposalCatalog(
    input: TutorRunInput,
    state: TutorRequestState,
) {
    const blocks = new Map<string, readonly LearningBlock[]>();
    const catalog: Descriptor[] = [];
    for (const [index, descriptor] of state.proposals.entries()) {
        if (!input.readBlockProposal) {
            catalog.push(descriptor);
            continue;
        }

        try {
            const proposal = await input.readBlockProposal(descriptor.id);
            if (proposal.id !== descriptor.id) {
                continue;
            }

            blocks.set(proposal.id, proposal.blocks);
            catalog.push(
                describeLearningProposal(
                    proposal.id,
                    proposal.blocks,
                    descriptor.summary,
                    descriptor.ordinal ?? index + 1,
                ),
            );
        } catch {
            // A stopped/failed/deleted source is not authority and must not poison later turns.
            input.signal.throwIfAborted();
        }
    }

    return { catalog, blocks };
}

const normalized = (value: string) =>
    value.normalize('NFKC').toLocaleLowerCase();

export function proposalSelectionNeedsClarification(
    catalog: Descriptor[],
    ids: readonly string[],
    message: string,
    term?: string,
) {
    if (ids.some((id) => !catalog.some((entry) => entry.id === id))) {
        return true;
    }

    if (!ids.length) {
        return false;
    }

    if (term) {
        const exact = normalized(term);
        const matches = catalog.filter(
            (entry) =>
                entry.terms?.some((value) => normalized(value) === exact) ||
                entry.titles?.some((value) => normalized(value) === exact),
        );

        return (
            !normalized(message).includes(exact) ||
            matches.length !== 1 ||
            ids.length !== 1 ||
            matches[0]!.id !== ids[0]
        );
    }

    if (ids.every((id) => message.includes(id))) {
        return false;
    }

    const chosen = catalog.filter((entry) => ids.includes(entry.id));
    const candidates = catalog.filter((entry) =>
        chosen.some((selected) =>
            selected.kinds?.some((kind) => entry.kinds?.includes(kind)),
        ),
    );

    return ids.length === 1 && candidates.length > 1;
}
