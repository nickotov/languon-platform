/** Fairly alternates independent queues within each existing worker slot. */
export class DictionaryWorkerCoordinator<TInput> {
    private audioNext = true;

    public constructor(
        private readonly proposals: {
            processNext(input: TInput): Promise<boolean>;
        },
        private readonly audio: {
            runOnce(signal: AbortSignal): Promise<boolean>;
        },
    ) {}

    public async processNext(
        input: TInput & { signal: AbortSignal },
    ): Promise<boolean> {
        const audioFirst = this.audioNext;
        this.audioNext = !this.audioNext;
        const audio = () => this.audio.runOnce(input.signal);
        const proposals = () => this.proposals.processNext(input);
        const first = audioFirst ? audio : proposals;
        const second = audioFirst ? proposals : audio;
        if (await first()) return true;
        input.signal.throwIfAborted();
        return second();
    }
}
