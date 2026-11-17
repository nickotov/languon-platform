import type { GenerationTaskInput } from '@languon/contracts';
import type { GenerationSourceSnapshot } from './ports/generation-run';

/** Exact captured text that a bilingual task must preserve in its source segments. */
export function generationTaskCapturedText(
    inputs: readonly GenerationTaskInput[],
    sources: readonly GenerationSourceSnapshot[],
): string {
    return inputs
        .flatMap((input) =>
            input.kind === 'source'
                ? sources
                      .filter((source) => source.sourceId === input.sourceId)
                      .flatMap((source) => [
                          ...(source.selection ? [source.selection.text] : []),
                          ...(source.providedText
                              ? [source.providedText.text]
                              : []),
                          ...source.blocks.flatMap((block) =>
                              block.type === 'bilingual-text'
                                  ? block.segments.map(
                                        (segment) => segment.text,
                                    )
                                  : [],
                          ),
                      ])
                : [],
        )
        .join('\n');
}
