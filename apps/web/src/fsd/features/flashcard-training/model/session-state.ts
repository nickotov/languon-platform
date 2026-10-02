import type { ApiError } from '../lib/api-error';
import { shuffled } from '../lib/flashcard-fields';
import type {
    Configuration,
    Face,
    FlashcardItem,
    LearningApi,
    Progress,
    Rating,
} from '../types';

export interface SessionInput {
    sessionId: string;
    configuration: Configuration;
    shuffle: boolean;
    entryIds: string[];
    signedIn: boolean;
    api: LearningApi;
}
export type Phase = 'loading' | 'card' | 'results' | 'error' | 'unavailable';
export type ConflictKind = 'content' | 'operation' | 'undo';
export interface RoundStats {
    reviewed: number;
    known: number;
    again: number;
}
export interface Snapshot {
    index: number;
    face: Face;
    roundStats: RoundStats;
    outcomes: Record<string, Rating>;
    reviewEvents: number;
    roundsCompleted: number;
}
export interface AckedRating {
    attemptId: string | null;
    entryId: string;
    rating: Rating;
    snapshot: Snapshot;
}
export interface Pending {
    kind: 'rate' | 'undo';
    rating: Rating;
    entryId: string;
    operationId: string;
    status: 'saving' | 'error';
    error?: ApiError;
    retryAt?: number | undefined;
}
export interface SessionState {
    phase: Phase;
    round: number;
    allIds: string[];
    queue: string[];
    index: number;
    face: Face;
    items: Record<string, FlashcardItem>;
    itemsLoading: boolean;
    roundStats: RoundStats;
    outcomes: Record<string, Rating>;
    reviewEvents: number;
    roundsCompleted: number;
    savedCount: number;
    lastAck: AckedRating | null;
    pending: Pending | null;
    conflict: ConflictKind | null;
    conflictBusy: boolean;
    notices: string[];
    error: ApiError | null;
    errorRetryAt?: number | undefined;
    progress: Progress | null;
    progressStatus: 'idle' | 'loading' | 'error';
    announcement: string;
}
export const EMPTY_STATS: RoundStats = { reviewed: 0, known: 0, again: 0 };
export function initialSession(input: SessionInput): SessionState {
    return {
        phase: input.entryIds.length ? 'loading' : 'results',
        round: 1,
        allIds: [...input.entryIds],
        queue: input.shuffle ? shuffled(input.entryIds) : [...input.entryIds],
        index: 0,
        face: 'front',
        items: {},
        itemsLoading: false,
        roundStats: { ...EMPTY_STATS },
        outcomes: {},
        reviewEvents: 0,
        roundsCompleted: 0,
        savedCount: 0,
        lastAck: null,
        pending: null,
        conflict: null,
        conflictBusy: false,
        notices: [],
        error: null,
        progress: null,
        progressStatus: 'idle',
        announcement: '',
    };
}

export interface SessionHost {
    input: SessionInput;
    getState(): SessionState;
    patch(change: Partial<SessionState>): void;
    currentGeneration(): number;
    isCurrent(generation: number): boolean;
    unavailable(): void;
    load(): Promise<void>;
    refreshProgress(): Promise<void>;
}
