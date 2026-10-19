import { useCallback, useEffect, useState } from 'react';
import { useDirtyNavigation } from '@/fsd/shared/lib/navigation/use-dirty-navigation';

export function useAssistantNavigation() {
    const navigation = useDirtyNavigation();
    const [discardRevision, setDiscardRevision] = useState(0);
    const [dirtyDrafts, setDirtyDrafts] = useState<Set<string>>(new Set());
    const draftDirty = useCallback((id: string, dirty: boolean) => {
        setDirtyDrafts((previous) => {
            if (previous.has(id) === dirty) return previous;
            const next = new Set(previous);
            if (dirty) next.add(id);
            else next.delete(id);
            return next;
        });
    }, []);
    useEffect(
        () => navigation.setDirty(dirtyDrafts.size > 0),
        [dirtyDrafts, navigation.setDirty],
    );
    function discard() {
        setDiscardRevision((previous) => previous + 1);
        navigation.discard();
    }
    return {
        navigation: { ...navigation, discard },
        draftDirty,
        discardRevision,
    };
}
