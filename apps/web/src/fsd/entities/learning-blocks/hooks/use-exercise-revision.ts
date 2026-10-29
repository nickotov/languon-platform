import { useState } from 'react';

/** First private-state hydration adopts the revision; later source revisions reset practice. */
export function useExerciseRevision(revision: string | undefined) {
    const [known, setKnown] = useState({ observed: revision, fence: revision });
    if (revision !== undefined && revision !== known.observed) {
        setKnown({
            observed: revision,
            fence: known.observed === undefined ? known.fence : revision,
        });
    }
    return known.fence;
}
