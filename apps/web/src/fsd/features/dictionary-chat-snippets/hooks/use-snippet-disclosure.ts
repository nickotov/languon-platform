import { useEffect, useRef, useState } from 'react';
import type { DictionaryChatSnippet } from '@languon/contracts';

/** A visible completion can open a new artifact once; fetching history cannot. */
export function useSnippetDisclosure(
    scope: string,
    snippets: DictionaryChatSnippet[],
    ready: boolean,
    completionKey: string,
    visible: boolean,
) {
    const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const observed = useRef({
        scope,
        completionKey,
        knownIds: new Set<string>(),
        pendingIds: new Set<string>(),
        initialized: false,
        eligibleTurns: new Set<string>(),
    });

    useEffect(() => {
        let current = observed.current;
        if (current.scope !== scope) {
            current = {
                scope,
                completionKey,
                knownIds: new Set(),
                pendingIds: new Set(),
                initialized: false,
                eligibleTurns: new Set(),
            };

            observed.current = current;
            setExpandedIds(new Set());
        }

        if (!visible) {
            current.eligibleTurns.clear();
            current.pendingIds.clear();
            setExpandedIds((previous) =>
                previous.size ? new Set() : previous,
            );
        }

        if (current.completionKey !== completionKey) {
            const previousKeys = new Set(current.completionKey.split(','));
            current.completionKey = completionKey;
            if (visible) {
                for (const key of completionKey.split(',')) {
                    if (key && !previousKeys.has(key)) {
                        current.eligibleTurns.add(key.split(':')[0]!);
                    }
                }
            }
        }

        if (!ready) {
            return;
        }

        for (const snippet of snippets) {
            if (
                visible &&
                !current.knownIds.has(snippet.id) &&
                (current.initialized ||
                    current.eligibleTurns.has(snippet.turnId))
            ) {
                current.pendingIds.add(snippet.id);
            }

            current.knownIds.add(snippet.id);
        }

        current.initialized = true;
        // Reconciliation may return a row before its matching tool event.
        // Keep that new row eligible without reopening already reviewed IDs.
        const fresh = snippets.filter(
            (snippet) =>
                current.pendingIds.has(snippet.id) &&
                current.eligibleTurns.has(snippet.turnId),
        );

        if (visible && fresh.length) {
            for (const snippet of fresh) {
                current.pendingIds.delete(snippet.id);
            }

            setExpandedIds((previous) => {
                const next = new Set(previous);
                for (const snippet of fresh) {
                    next.add(snippet.id);
                }

                return next;
            });
        }
    }, [scope, snippets, ready, completionKey, visible]);

    function toggle(id: string) {
        // A deliberate review choice also wins over a late completion event.
        observed.current.pendingIds.delete(id);
        setExpandedIds((previous) => {
            const next = new Set(previous);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
    }

    return { expandedIds, toggle };
}
