import type { GenerationPlan } from '@languon/contracts';
import { generationPlanCapacity } from '../../../application/learning-content-plan-capacity';
import type {
    GenerationArtifact,
    GenerationSourceSnapshot,
} from '../../../application/ports/generation-run';
import { ConversationError } from '../../../domain/conversation';

/** A fresh allowance must be able to produce at least one validated checkpoint. */
export function assertGenerationCapacity(
    plan: GenerationPlan,
    sources: GenerationSourceSnapshot[],
    artifacts: GenerationArtifact[] = [],
) {
    const capacity = generationPlanCapacity(
        plan,
        artifacts
            .filter((artifact) => artifact.taskComplete)
            .map((artifact) => artifact.taskId),
        artifacts.map((artifact) => artifact.batchKey),
        sources,
        // Artifacts are immutable cumulative prefixes in checkpoint order. Use
        // the latest body per task, never sum historical prefix lengths.
        new Map(
            artifacts.map((artifact) => [
                artifact.taskId,
                artifact.body.document.content?.filter(
                    (node) => node.type === 'learningBlock',
                ).length ?? 0,
            ]),
        ),
    );

    if (capacity.status === 'unsupported') {
        throw new ConversationError(
            'generation_scope_change',
            'This lesson needs smaller sections. Revise the plan before continuing.',
        );
    }

    return capacity.minimumOutputTokens;
}
