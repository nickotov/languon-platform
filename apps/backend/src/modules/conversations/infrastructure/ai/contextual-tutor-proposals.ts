import type { LearningBlock } from '@languon/contracts';
import type { TutorRunInput } from '../../application/ports/tutor-runner.js';
import { sameLearningBlockCopyContent } from '../../application/tutor-request-sources';

type BlockProposal = Parameters<
    NonNullable<TutorRunInput['onBlockProposal']>
>[0];

function requireCompleteCopy(
    proposal: BlockProposal,
    targets: LearningBlock[],
) {
    const remaining = [...targets];

    if (proposal.targetBlockId || proposal.blocks.length !== targets.length) {
        throw new Error('Copy the complete requested source set exactly once.');
    }

    for (const block of proposal.blocks) {
        const match = remaining.findIndex((source) =>
            sameLearningBlockCopyContent(block, source),
        );

        if (match < 0) {
            throw new Error(
                'Copy the complete requested source set exactly once.',
            );
        }

        remaining.splice(match, 1);
    }
}

function requireTargetedRevision(
    proposal: BlockProposal,
    targets: LearningBlock[],
) {
    const target = targets.find((block) => block.id === proposal.targetBlockId);

    if (
        !target ||
        proposal.blocks.length !== 1 ||
        proposal.blocks[0]!.type !== target.type
    ) {
        throw new Error(
            'A revision must replace exactly its referenced block and preserve its type.',
        );
    }
}

/** Target selection happens after tool construction; guards share this turn-local state. */
export function createTutorProposalGuard(
    input: Pick<TutorRunInput, 'onBlockProposal'>,
) {
    let targets: LearningBlock[] = [];
    let copy = false;
    const completedTargets = new Set<string>();
    const claimedTargets = new Set<string>();

    const onBlockProposal = input.onBlockProposal
        ? async (proposal: BlockProposal) => {
              if (copy) {
                  requireCompleteCopy(proposal, targets);
              } else if (targets.length) {
                  requireTargetedRevision(proposal, targets);
              }

              let claims: string[] = [];

              if (targets.length) {
                  claims = copy
                      ? targets.map((block) => block.id)
                      : [proposal.targetBlockId!];
              }

              if (claims.some((id) => claimedTargets.has(id))) {
                  throw new Error(
                      'Each requested source can be proposed only once.',
                  );
              }

              claims.forEach((id) => claimedTargets.add(id));
              let persisted;

              try {
                  persisted = await input.onBlockProposal!(proposal);
              } catch (error) {
                  // A rejected persistence attempt must not consume the target.
                  claims.forEach((id) => claimedTargets.delete(id));

                  throw error;
              }

              if (copy) {
                  targets.forEach((target) => completedTargets.add(target.id));
              }

              if (proposal.targetBlockId) {
                  completedTargets.add(proposal.targetBlockId);
              }

              return persisted;
          }
        : undefined;

    return {
        onBlockProposal,
        setTargets(material: LearningBlock[], copyRequested: boolean) {
            targets = material;
            copy = copyRequested;
        },
        assertCompleted() {
            if (targets.some((target) => !completedTargets.has(target.id))) {
                throw new Error(
                    'The requested block revisions were not completed. Retry the request.',
                );
            }
        },
    };
}
