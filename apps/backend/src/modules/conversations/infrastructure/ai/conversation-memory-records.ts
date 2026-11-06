import { projectTutorMemoryConfig } from './conversation-memory-config';
import type { ObservationalMemoryRecord } from '@mastra/core/storage';
import type { TutorMemoryPort } from '../../application/ports/tutor-runner.js';

const unsupported = (): never => {
    throw new Error('This conversation memory operation is not authorized.');
};
const serialize = (value: object): Record<string, unknown> =>
    JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
const recordKey = (id: string) => `observations:${id}`;

/** Only records listed in this conversation's index may be read or updated. */
export class ConversationMemoryRecords {
    constructor(
        private readonly port: TutorMemoryPort,
        private readonly assertScope: (
            threadId: string | null | undefined,
            resourceId?: string,
        ) => void,
    ) {}

    async index(): Promise<string[]> {
        const state = await this.port.readState('observations:index');

        return Array.isArray(state?.ids)
            ? state.ids.filter((id): id is string => typeof id === 'string')
            : [];
    }

    async readRecord(id: string): Promise<ObservationalMemoryRecord> {
        if (!(await this.index()).includes(id)) {
            return unsupported();
        }

        const raw = await this.port.readState(recordKey(id));
        if (!raw) {
            throw new Error('Conversation memory record is unavailable.');
        }

        const record = {
            ...raw,
            config: projectTutorMemoryConfig(raw.config),
            createdAt: new Date(String(raw.createdAt)),
            updatedAt: new Date(String(raw.updatedAt)),
            lastObservedAt: raw.lastObservedAt
                ? new Date(String(raw.lastObservedAt))
                : undefined,
            lastBufferedAtTime: raw.lastBufferedAtTime
                ? new Date(String(raw.lastBufferedAtTime))
                : null,
        } as ObservationalMemoryRecord;

        this.assertScope(record.threadId, record.resourceId);

        return record;
    }

    async writeRecord(record: ObservationalMemoryRecord, append = false) {
        this.assertScope(record.threadId, record.resourceId);
        const ids = await this.index();
        if (!append && !ids.includes(record.id)) {
            unsupported();
        }

        await this.port.writeState({
            [recordKey(record.id)]: serialize({
                ...record,
                config: projectTutorMemoryConfig(record.config),
                updatedAt: new Date(),
            }),
            ...(append
                ? {
                      'observations:index': {
                          ids: [...new Set([...ids, record.id])],
                      },
                  }
                : {}),
        });
    }
}
