import type { LearningBlock } from '@languon/contracts';
import type {
    LearningContentBrief,
    LearningContentTask,
} from './learning-content-contract';

export interface LearningContentTaskResult {
    taskId: string;
    blocks: LearningBlock[];
}

export interface LearningContentBatchResults {
    prefixBrief: LearningContentBrief;
    results: LearningContentTaskResult[];
}

function vocabularyBlock(result: LearningContentTaskResult) {
    const block = result.blocks[0];
    if (result.blocks.length !== 1 || block?.type !== 'vocabulary') {
        throw new Error('Vocabulary fragments require one vocabulary block.');
    }

    return block;
}

function appendVocabulary(
    previous: LearningContentTaskResult,
    incoming: LearningContentTaskResult,
): LearningContentTaskResult {
    const first = vocabularyBlock(previous);
    const next = vocabularyBlock(incoming);
    if (
        first.language !== next.language ||
        first.translationLanguage !== next.translationLanguage
    ) {
        throw new Error('Vocabulary fragments must use the same languages.');
    }

    return {
        taskId: previous.taskId,
        blocks: [{ ...first, entries: [...first.entries, ...next.entries] }],
    };
}

function prefixTask(
    task: LearningContentTask,
    result: LearningContentTaskResult,
): LearningContentTask {
    if (task.kind !== 'vocabulary') {
        return task;
    }

    const count = vocabularyBlock(result).entries.length;
    const total = task.words?.length ?? task.count ?? 10;
    if (count > total) {
        throw new Error('Vocabulary fragments exceed the requested count.');
    }

    return {
        ...task,
        count,
        ...(task.words ? { words: task.words.slice(0, count) } : {}),
    };
}

/**
 * Returns a tentative immutable candidate. The caller must validate the whole
 * prefix before accepting it, so cross-call duplicate IDs/terms and invalid
 * references cannot replace previously validated progress.
 */
export function mergeLearningContentBatchResults(
    originalBrief: LearningContentBrief,
    completed: readonly LearningContentTaskResult[],
    incoming: readonly LearningContentTaskResult[],
): LearningContentBatchResults {
    const tasksById = new Map(
        originalBrief.tasks.map((task) => [task.id, task]),
    );
    const merged = new Map<string, LearningContentTaskResult>();

    for (const result of completed) {
        if (!tasksById.has(result.taskId) || merged.has(result.taskId)) {
            throw new Error(
                'Completed content has an unexpected task identity.',
            );
        }

        merged.set(result.taskId, result);
    }

    const incomingIds = new Set<string>();
    for (const result of incoming) {
        const task = tasksById.get(result.taskId);
        if (!task || incomingIds.has(result.taskId)) {
            throw new Error('Batch content has an unexpected task identity.');
        }

        incomingIds.add(result.taskId);

        const previous = merged.get(result.taskId);
        if (previous && task.kind !== 'vocabulary') {
            throw new Error('Only vocabulary tasks may span multiple batches.');
        }

        merged.set(
            result.taskId,
            previous ? appendVocabulary(previous, result) : result,
        );
    }

    const prefixTasks: LearningContentTask[] = [];
    const results: LearningContentTaskResult[] = [];
    for (const task of originalBrief.tasks) {
        const result = merged.get(task.id);
        if (result) {
            prefixTasks.push(prefixTask(task, result));
            results.push(result);
        }
    }

    return { prefixBrief: { tasks: prefixTasks }, results };
}
