import { useRef, useState } from 'react';

/** Keep one confirmed target until its deletion resolves, including same-tick clicks. */
export function useConversationDeletion({
    remove,
    onDeleted,
    onError,
}: {
    remove(id: string): Promise<void>;
    onDeleted(): void;
    onError(error: unknown): void;
}) {
    const [deleting, setDeleting] = useState<string | null>(null);
    const [deletingPending, setDeletingPending] = useState(false);
    const inFlight = useRef(false);
    function requestDelete(id: string) {
        if (!inFlight.current) setDeleting(id);
    }
    function cancelDelete() {
        if (!inFlight.current) setDeleting(null);
    }
    async function confirmDelete() {
        if (!deleting || inFlight.current) return;
        const target = deleting;
        inFlight.current = true;
        setDeletingPending(true);
        try {
            await remove(target);
            setDeleting(null);
            onDeleted();
        } catch (error) {
            onError(error);
        } finally {
            inFlight.current = false;
            setDeletingPending(false);
        }
    }
    return {
        deleting,
        deletingPending,
        requestDelete,
        cancelDelete,
        confirmDelete,
    };
}
