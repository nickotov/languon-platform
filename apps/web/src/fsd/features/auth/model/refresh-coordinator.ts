import {
  AuthenticationSuccessResponseSchema,
  type AuthenticationSuccessResponse,
} from "@languon/contracts";

export type RefreshResult = AuthenticationSuccessResponse | null;

interface CoordinationMessage {
  candidateId?: string;
  outcome?: RefreshResult;
  senderId: string;
  type: "candidate" | "outcome" | "refreshing";
}

interface MessageEventLike {
  data: unknown;
}

interface ChannelLike {
  addEventListener(
    type: "message",
    listener: (event: MessageEventLike) => void,
  ): void;
  close(): void;
  postMessage(message: CoordinationMessage): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEventLike) => void,
  ): void;
}

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

interface RefreshCoordinatorOptions {
  channel?: ChannelLike;
  electionDelayMs?: number;
  id?: string;
  locks?: LockManagerLike;
  outcomeTimeoutMs?: number;
}

const CHANNEL_NAME = "languon-auth-session-v1";
const LOCK_NAME = "languon-auth-refresh-v1";

function isCoordinationMessage(value: unknown): value is CoordinationMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Partial<CoordinationMessage>;
  return (
    typeof message.senderId === "string" &&
    (message.type === "candidate" ||
      message.type === "outcome" ||
      message.type === "refreshing")
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function browserChannel(): ChannelLike | undefined {
  return typeof window === "undefined" ||
    typeof BroadcastChannel === "undefined"
    ? undefined
    : new BroadcastChannel(CHANNEL_NAME);
}

function browserLocks(): LockManagerLike | undefined {
  if (typeof navigator === "undefined" || !("locks" in navigator))
    return undefined;
  return navigator.locks;
}

function coordinatorId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class RefreshCoordinator {
  private readonly candidates = new Set<string>();
  private readonly channel: ChannelLike | undefined;
  private readonly electionDelayMs: number;
  private inFlight: Promise<RefreshResult> | null = null;
  private lastOutcome: RefreshResult | undefined;
  private readonly listeners = new Set<(outcome: RefreshResult) => void>();
  private readonly locks: LockManagerLike | undefined;
  private readonly outcomeTimeoutMs: number;
  private refreshing = false;
  private refreshingPeer = false;
  private revision = 0;
  private readonly senderId: string;

  constructor(options: RefreshCoordinatorOptions = {}) {
    this.channel = options.channel ?? browserChannel();
    this.electionDelayMs = options.electionDelayMs ?? 50;
    this.locks = options.locks ?? browserLocks();
    this.outcomeTimeoutMs = options.outcomeTimeoutMs ?? 15_000;
    this.senderId = options.id ?? coordinatorId();
    this.channel?.addEventListener("message", this.onMessage);
  }

  subscribe(listener: (outcome: RefreshResult) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  refresh(
    action: () => Promise<AuthenticationSuccessResponse>,
  ): Promise<RefreshResult> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.coordinate(action).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  publishAuthenticated(response: AuthenticationSuccessResponse): void {
    this.publish(response);
  }

  publishSignedOut(): void {
    this.publish(null);
  }

  async settle(): Promise<void> {
    if (this.inFlight) await this.inFlight;
  }

  async signOut(action: () => Promise<void>): Promise<void> {
    await this.settle();
    const execute = async () => {
      this.refreshing = true;
      this.channel?.postMessage({
        senderId: this.senderId,
        type: "refreshing",
      });
      try {
        await action();
        this.publish(null);
      } finally {
        this.refreshing = false;
      }
    };

    if (this.locks) {
      await this.locks.request(LOCK_NAME, execute);
      return;
    }
    if (!this.channel) {
      await execute();
      return;
    }

    const revisionAtStart = this.revision;
    this.candidates.clear();
    this.candidates.add(this.senderId);
    this.refreshingPeer = false;
    this.channel.postMessage({
      candidateId: this.senderId,
      senderId: this.senderId,
      type: "candidate",
    });
    await delay(this.electionDelayMs);
    const leader = [...this.candidates].sort()[0];
    if (this.refreshingPeer || leader !== this.senderId) {
      const peerOutcome = await this.waitForOutcome(revisionAtStart);
      if (peerOutcome === null) return;
    }
    await execute();
  }

  async authenticate<T>(
    action: () => Promise<T>,
    outcome: (result: T) => AuthenticationSuccessResponse | undefined,
  ): Promise<T> {
    await this.settle();
    const execute = async () => {
      const result = await action();
      const authenticated = outcome(result);
      if (authenticated) this.publish(authenticated);
      return result;
    };
    if (this.locks) {
      return this.locks.request(LOCK_NAME, execute);
    }
    if (!this.channel) return execute();

    const revisionAtStart = this.revision;
    this.candidates.clear();
    this.candidates.add(this.senderId);
    this.refreshingPeer = false;
    this.channel.postMessage({
      candidateId: this.senderId,
      senderId: this.senderId,
      type: "candidate",
    });
    await delay(this.electionDelayMs);
    const leader = [...this.candidates].sort()[0];
    if (this.refreshingPeer || leader !== this.senderId) {
      await this.waitForOutcome(revisionAtStart);
    }

    this.refreshing = true;
    this.channel.postMessage({ senderId: this.senderId, type: "refreshing" });
    try {
      return await execute();
    } catch (error) {
      this.publish(this.lastOutcome ?? null);
      throw error;
    } finally {
      this.refreshing = false;
    }
  }

  destroy(): void {
    this.channel?.removeEventListener("message", this.onMessage);
    this.channel?.close();
    this.listeners.clear();
  }

  private readonly onMessage = (event: MessageEventLike): void => {
    if (
      !isCoordinationMessage(event.data) ||
      event.data.senderId === this.senderId
    ) {
      return;
    }

    const message = event.data;
    if (message.type === "candidate" && message.candidateId) {
      this.candidates.add(message.candidateId);
      if (this.refreshing) {
        this.channel?.postMessage({
          senderId: this.senderId,
          type: "refreshing",
        });
      }
      return;
    }

    if (message.type === "outcome" && "outcome" in message) {
      if (message.outcome === null) {
        this.accept(null);
        return;
      }
      const outcome = AuthenticationSuccessResponseSchema.safeParse(
        message.outcome,
      );
      if (outcome.success) this.accept(outcome.data);
      return;
    }

    if (message.type === "refreshing") {
      this.refreshingPeer = true;
    }
  };

  private async coordinate(
    action: () => Promise<AuthenticationSuccessResponse>,
  ): Promise<RefreshResult> {
    const revisionAtStart = this.revision;
    if (this.locks) {
      return this.locks.request(LOCK_NAME, async () => {
        if (this.revision > revisionAtStart) return this.lastOutcome ?? null;
        if (this.refreshingPeer) {
          const peerOutcome = await this.waitForOutcome(revisionAtStart);
          if (peerOutcome !== undefined) return peerOutcome;
        }
        return this.perform(action);
      });
    }

    if (!this.channel) return this.perform(action);

    this.candidates.clear();
    this.refreshingPeer = false;
    this.candidates.add(this.senderId);
    this.channel.postMessage({
      candidateId: this.senderId,
      senderId: this.senderId,
      type: "candidate",
    });
    await delay(this.electionDelayMs);

    if (this.revision > revisionAtStart) return this.lastOutcome ?? null;
    if (this.refreshingPeer) {
      const activePeerOutcome = await this.waitForOutcome(revisionAtStart);
      if (activePeerOutcome !== undefined) return activePeerOutcome;
    }
    const leader = [...this.candidates].sort()[0];
    if (leader === this.senderId) return this.perform(action);

    const peerOutcome = await this.waitForOutcome(revisionAtStart);
    return peerOutcome === undefined ? this.perform(action) : peerOutcome;
  }

  private async perform(
    action: () => Promise<AuthenticationSuccessResponse>,
  ): Promise<RefreshResult> {
    const revisionAtStart = this.revision;
    this.refreshing = true;
    this.channel?.postMessage({ senderId: this.senderId, type: "refreshing" });
    try {
      const outcome = await action();
      if (this.revision > revisionAtStart) return this.lastOutcome ?? null;
      this.publish(outcome);
      return outcome;
    } catch {
      if (this.revision > revisionAtStart) return this.lastOutcome ?? null;
      this.publish(null);
      return null;
    } finally {
      this.refreshing = false;
    }
  }

  private publish(outcome: RefreshResult): void {
    this.accept(outcome);
    this.channel?.postMessage({
      outcome,
      senderId: this.senderId,
      type: "outcome",
    });
  }

  private accept(outcome: RefreshResult): void {
    this.lastOutcome = outcome;
    this.refreshingPeer = false;
    this.revision += 1;
    for (const listener of this.listeners) listener(outcome);
  }

  private async waitForOutcome(
    revisionAtStart: number,
  ): Promise<RefreshResult | undefined> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < this.outcomeTimeoutMs) {
      if (this.revision > revisionAtStart) return this.lastOutcome ?? null;
      await delay(20);
    }
    return undefined;
  }
}
