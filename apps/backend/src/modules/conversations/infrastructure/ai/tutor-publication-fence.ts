import type { TutorRunInput } from '../../application/ports/tutor-runner';

/** A rejected route may restart the runner only until its first outward publication.
 * Fence before the write: a lost acknowledgement can still mean it committed. */
export function fenceTutorPublications(input: TutorRunInput) {
    let published = false;
    function fence<Args extends unknown[], Result>(
        publish: (...args: Args) => Result,
    ) {
        return (...args: Args) => {
            published = true;

            return publish(...args);
        };
    }

    // The runner port reserves on* callbacks for outward publications. Iterating
    // the supplied callbacks covers new tools and preserves optional capabilities.
    const callbacks = Object.fromEntries(
        Object.entries(input)
            .filter(
                ([name, value]) =>
                    name.startsWith('on') && typeof value === 'function',
            )
            .map(([name, value]) => [name, fence(value)]),
    );

    return {
        input: {
            ...input,
            ...callbacks,
        } satisfies TutorRunInput,
        hasPublished: () => published,
    };
}
