import type { LearningBlock } from '@languon/contracts';
import type { LearningContentBrief } from '../../application/learning-content-contract';
import type { TutorRunInput } from '../../application/ports/tutor-runner';
import {
    tutorRequestStateKey,
    TutorRequestStateSchema,
} from '../../application/tutor-request-contract';
import {
    frozenTutorTextSources,
    groundLearningContentBrief,
} from '../../application/tutor-request-sources';
import type { ExerciseAuthoringSource } from './exercise-authoring-context';
import {
    resolveExerciseSourceContexts,
    exerciseGroundingSources,
} from './exercise-source-resolution';

/** Source-bearing tool input is resolved from this operation's authority, never its supplied text. */
export async function resolveLearningToolSources(
    input: Pick<TutorRunInput, 'message' | 'memory' | 'readBlockProposal'> &
        Partial<
            Pick<TutorRunInput, 'sourceContext' | 'readContext' | 'sourceNote'>
        >,
    brief: LearningContentBrief,
    taskSources?: Map<string, ExerciseAuthoringSource>,
): Promise<LearningContentBrief> {
    const sources = new Map<string, readonly LearningBlock[]>();
    const proposalIds = [
        ...new Set(
            brief.tasks.flatMap((task) =>
                task.source?.kind === 'proposal'
                    ? [task.source.proposalId]
                    : [],
            ),
        ),
    ];

    if (proposalIds.length) {
        const stored = await input.memory.readState(tutorRequestStateKey);
        const catalog = TutorRequestStateSchema.shape.proposals.parse(
            stored?.proposals ?? [],
        );

        for (const id of proposalIds) {
            if (
                !catalog.some((item) => item.id === id) ||
                !input.readBlockProposal
            ) {
                throw new Error('The selected proposal is unavailable.');
            }

            const proposal = await input.readBlockProposal(id);
            if (proposal.id !== id) {
                throw new Error('The selected proposal is unavailable.');
            }

            sources.set(id, proposal.blocks);
        }
    }

    const captured = await resolveExerciseSourceContexts(
        input,
        brief,
        sources,
        taskSources,
    );

    return groundLearningContentBrief(
        {
            tasks: brief.tasks.map((task) => {
                if (!task.source) {
                    return task;
                }

                const { sourceText: _untrustedText, ...requirements } = task;

                return requirements;
            }),
        },
        frozenTutorTextSources(input),
        sources,
        [],
        exerciseGroundingSources(captured),
    );
}
