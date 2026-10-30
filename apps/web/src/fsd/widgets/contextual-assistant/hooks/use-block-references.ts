import { useEffect, useReducer, useRef } from 'react';
import type { KnowledgeBlockReference } from '@/fsd/features/knowledge-notes';

type State = { selected: KnowledgeBlockReference[]; limitReached: boolean };
type Action =
    | { type: 'addMany'; items: KnowledgeBlockReference[] }
    | { type: 'add'; item: KnowledgeBlockReference }
    | { type: 'remove'; ids: string[] }
    | { type: 'clear' };
function reduce(state: State, action: Action): State {
    if (action.type === 'addMany') {
        const additions = action.items.filter(
            (item) => !state.selected.some((current) => current.id === item.id),
        );
        if (state.selected.length + additions.length > 8)
            return { ...state, limitReached: true };
        return {
            selected: [...state.selected, ...additions],
            limitReached: false,
        };
    }
    if (action.type === 'clear') return { selected: [], limitReached: false };
    if (action.type === 'remove')
        return {
            selected: state.selected.filter(
                (item) => !action.ids.includes(item.id),
            ),
            limitReached: false,
        };
    if (state.selected.some((item) => item.id === action.item.id)) return state;
    if (state.selected.length >= 8) return { ...state, limitReached: true };
    return { selected: [...state.selected, action.item], limitReached: false };
}
export function useBlockReferences(
    conversationId: string | null,
    request: { id: string; blockIds?: string[] | undefined } | undefined,
    available: KnowledgeBlockReference[] = [],
) {
    const [state, dispatch] = useReducer(reduce, {
        selected: [],
        limitReached: false,
    });
    const lastRequest = useRef<string | null>(null);
    const previousConversation = useRef(conversationId);
    useEffect(() => {
        if (
            previousConversation.current &&
            previousConversation.current !== conversationId
        )
            dispatch({ type: 'clear' });
        previousConversation.current = conversationId;
    }, [conversationId]);
    function add(id: string) {
        const item = available.find((item) => item.id === id);
        if (item) dispatch({ type: 'add', item });
    }
    useEffect(() => {
        if (!request || lastRequest.current === request.id) return;
        lastRequest.current = request.id;
        const items = [...new Set(request.blockIds ?? [])].flatMap((id) => {
            const item = available.find((item) => item.id === id);
            return item ? [item] : [];
        });
        dispatch({ type: 'addMany', items });
    }, [request, available]);
    function remove(id: string) {
        dispatch({ type: 'remove', ids: [id] });
    }
    function sent(ids: string[]) {
        dispatch({ type: 'remove', ids });
    }
    return {
        ...state,
        add,
        remove,
        sent,
        missing: state.selected.some(
            (item) => !available.some((current) => current.id === item.id),
        ),
    };
}
