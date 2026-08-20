import {
    AuthenticationSuccessResponseSchema,
    type AuthenticationSuccessResponse,
} from '@languon/contracts';

export type BrowserRefreshResult = AuthenticationSuccessResponse | null;

interface CoordinationMessage {
    outcome?: BrowserRefreshResult;
    senderId: string;
    type: 'outcome' | 'refreshing';
}

interface ChannelLike {
    addEventListener(
        type: 'message',
        listener: (event: { data: unknown }) => void,
    ): void;
    close(): void;
    postMessage(message: CoordinationMessage): void;
    removeEventListener(
        type: 'message',
        listener: (event: { data: unknown }) => void,
    ): void;
}

interface LockManagerLike {
    request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export interface BrowserRefreshCoordinatorOptions {
    channel?: ChannelLike;
    id?: string;
    locks?: LockManagerLike;
    namespace: string;
    outcomeTimeoutMs?: number;
}

function coordinatorId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isMessage(value: unknown): value is CoordinationMessage {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<CoordinationMessage>;
    return (
        typeof candidate.senderId === 'string' &&
        (candidate.type === 'outcome' || candidate.type === 'refreshing')
    );
}

export class BrowserRefreshCoordinator {
    private readonly channel: ChannelLike | undefined;
    private inFlight: Promise<BrowserRefreshResult> | null = null;
    private lastOutcome: BrowserRefreshResult | undefined;
    private readonly listeners = new Set<
        (outcome: BrowserRefreshResult) => void
    >();
    private readonly lockName: string;
    private readonly locks: LockManagerLike | undefined;
    private readonly outcomeTimeoutMs: number;
    private readonly senderId: string;
    private revision = 0;
    private refreshingPeer = false;

    public constructor(options: BrowserRefreshCoordinatorOptions) {
        if (!/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(options.namespace)) {
            throw new Error('A stable browser refresh namespace is required.');
        }
        this.channel =
            options.channel ??
            (typeof BroadcastChannel === 'undefined'
                ? undefined
                : new BroadcastChannel(`${options.namespace}-session-v1`));
        this.locks =
            options.locks ??
            (typeof navigator !== 'undefined' && 'locks' in navigator
                ? navigator.locks
                : undefined);
        this.lockName = `${options.namespace}-refresh-v1`;
        this.outcomeTimeoutMs = options.outcomeTimeoutMs ?? 15_000;
        this.senderId = options.id ?? coordinatorId();
        this.channel?.addEventListener('message', this.onMessage);
    }

    public refresh(
        action: () => Promise<AuthenticationSuccessResponse>,
    ): Promise<BrowserRefreshResult> {
        if (this.inFlight) return this.inFlight;
        this.inFlight = this.coordinateRefresh(action).finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    public publishAuthenticated(response: AuthenticationSuccessResponse) {
        this.publish(response);
    }

    public publishSignedOut() {
        this.publish(null);
    }

    public subscribe(
        listener: (outcome: BrowserRefreshResult) => void,
    ): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    public async settle(): Promise<void> {
        if (this.inFlight) await this.inFlight;
    }

    public async runExclusive<T>(action: () => Promise<T>): Promise<T> {
        await this.settle();
        return this.locks
            ? this.locks.request(this.lockName, action)
            : await action();
    }

    public destroy(): void {
        this.channel?.removeEventListener('message', this.onMessage);
        this.channel?.close();
        this.listeners.clear();
    }

    private readonly onMessage = (event: { data: unknown }) => {
        if (!isMessage(event.data) || event.data.senderId === this.senderId) {
            return;
        }
        if (event.data.type === 'refreshing') {
            this.refreshingPeer = true;
            return;
        }
        if (!('outcome' in event.data)) return;
        if (event.data.outcome === null) {
            this.accept(null);
            return;
        }
        const parsed = AuthenticationSuccessResponseSchema.safeParse(
            event.data.outcome,
        );
        if (parsed.success) this.accept(parsed.data);
    };

    private async coordinateRefresh(
        action: () => Promise<AuthenticationSuccessResponse>,
    ): Promise<BrowserRefreshResult> {
        const revisionAtStart = this.revision;
        if (this.locks) {
            return this.locks.request(this.lockName, async () => {
                // BroadcastChannel delivery is a separate task. Yield once after
                // lock handoff so the previous owner's outcome is observable.
                await delay(0);
                if (this.revision > revisionAtStart) {
                    return this.lastOutcome ?? null;
                }
                return this.performRefresh(action, revisionAtStart);
            });
        }
        if (this.refreshingPeer) {
            const peerOutcome = await this.waitForOutcome(revisionAtStart);
            if (peerOutcome !== undefined) return peerOutcome;
        }
        return this.performRefresh(action, revisionAtStart);
    }

    private async performRefresh(
        action: () => Promise<AuthenticationSuccessResponse>,
        revisionAtStart: number,
    ): Promise<BrowserRefreshResult> {
        this.channel?.postMessage({
            senderId: this.senderId,
            type: 'refreshing',
        });
        try {
            const outcome = await action();
            if (this.revision > revisionAtStart) {
                return this.lastOutcome ?? null;
            }
            this.publish(outcome);
            return outcome;
        } catch {
            if (this.revision > revisionAtStart) {
                return this.lastOutcome ?? null;
            }
            this.publish(null);
            return null;
        }
    }

    private publish(outcome: BrowserRefreshResult): void {
        this.accept(outcome);
        this.channel?.postMessage({
            outcome,
            senderId: this.senderId,
            type: 'outcome',
        });
    }

    private accept(outcome: BrowserRefreshResult): void {
        this.lastOutcome = outcome;
        this.refreshingPeer = false;
        this.revision += 1;
        for (const listener of this.listeners) listener(outcome);
    }

    private async waitForOutcome(
        revisionAtStart: number,
    ): Promise<BrowserRefreshResult | undefined> {
        const startedAt = Date.now();
        while (Date.now() - startedAt < this.outcomeTimeoutMs) {
            if (this.revision > revisionAtStart) {
                return this.lastOutcome ?? null;
            }
            await delay(20);
        }
        return undefined;
    }
}
