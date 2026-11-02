import { constants } from 'node:fs';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
    ACTION_MICROS,
    DAY_MICROS,
    TaskSchema,
    requireSafe,
} from './policy.mjs';

const EntrySchema = z
    .object({
        id: z.uuid(),
        task: TaskSchema,
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reservedMicros: z.literal(ACTION_MICROS),
        status: z.enum(['reserved', 'succeeded']),
        noteId: z.uuid().optional(),
        conversationId: z.uuid().optional(),
        turnId: z.uuid().optional(),
        chargedCredits: z
            .string()
            .regex(/^\d+(\.\d{1,3})?$/)
            .optional(),
        providerExpenseMicros: z
            .number()
            .int()
            .positive()
            .max(ACTION_MICROS)
            .optional(),
    })
    .strict();
const StateSchema = z
    .object({
        version: z.literal(1),
        userId: z.uuid(),
        entries: z.array(EntrySchema).max(10000),
    })
    .strict();

async function syncDirectory(path) {
    const directory = await open(dirname(path), 'r');
    try {
        await directory.sync();
    } finally {
        await directory.close();
    }
}

export async function privateRead(path) {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const stat = await file.stat();
        requireSafe(
            stat.isFile() &&
                (stat.mode & 0o077) === 0 &&
                stat.size <= 2_000_000,
            'unsafe-local-file',
        );

        return await file.readFile('utf8');
    } finally {
        await file.close();
    }
}

async function exclusiveWrite(path, value) {
    const file = await open(path, 'wx', 0o600);
    try {
        await file.writeFile(value);
        await file.sync();
    } finally {
        await file.close();
    }

    await syncDirectory(path);
}

async function exists(path) {
    try {
        await lstat(path);

        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }

        throw error;
    }
}

// One lock spans readiness, reservation and the HTTP journey. Never steal stale
// locks: a disconnected process may still own a paid action in the backend.
export async function withJournal(root, userId, operation) {
    const statePath = join(root, '.env.ai-smoke.state.json');
    const markerPath = join(root, '.env.ai-smoke.initialized');
    const lockPath = join(root, '.env.ai-smoke.lock');
    await exclusiveWrite(lockPath, `${process.pid}\n`);
    try {
        const read = async () => {
            requireSafe(
                (await privateRead(markerPath)).trim() === userId,
                'journal-marker-mismatch',
            );

            const state = StateSchema.parse(
                JSON.parse(await privateRead(statePath)),
            );

            requireSafe(
                state.userId === userId &&
                    new Set(state.entries.map((entry) => entry.id)).size ===
                        state.entries.length,
                'journal-identity-mismatch',
            );

            return state;
        };
        const write = async (state) => {
            StateSchema.parse(state);
            const temporary = `${statePath}.${randomUUID()}.tmp`;
            await exclusiveWrite(
                temporary,
                `${JSON.stringify(state, null, 2)}\n`,
            );

            await rename(temporary, statePath);
            await syncDirectory(statePath);
        };

        return await operation({
            read,
            initialize: async (historicalActions) => {
                requireSafe(
                    historicalActions === 0,
                    'used-account-cannot-initialize',
                );

                requireSafe(
                    !(await exists(markerPath)) && !(await exists(statePath)),
                    'journal-already-initialized',
                );

                // A crash between these writes leaves a marker and fails closed.
                await exclusiveWrite(markerPath, `${userId}\n`);
                await exclusiveWrite(
                    statePath,
                    `${JSON.stringify({ version: 1, userId, entries: [] })}\n`,
                );
            },
            reserve: async (task, day, globalExposureMicros) => {
                TaskSchema.parse(task);
                requireSafe(
                    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
                        Number.isSafeInteger(globalExposureMicros) &&
                        globalExposureMicros >= 0,
                    'invalid-expense-snapshot',
                );

                const state = await read();
                requireSafe(
                    state.entries.filter((entry) => entry.task === task)
                        .length < 2,
                    'task-call-limit',
                );

                requireSafe(
                    !state.entries.some((entry) => entry.day > day),
                    'clock-moved-backwards',
                );

                const held =
                    state.entries.filter((entry) => entry.day === day).length *
                    ACTION_MICROS;

                // Deliberately count all application costs as well as full local
                // reservations, even when they overlap. Never refund on failure.
                requireSafe(
                    globalExposureMicros + held + ACTION_MICROS <= DAY_MICROS,
                    'daily-call-limit',
                );

                const entry = {
                    id: randomUUID(),
                    task,
                    day,
                    reservedMicros: ACTION_MICROS,
                    status: 'reserved',
                };

                state.entries.push(entry);
                await write(state);

                return entry;
            },
            record: async (id, evidence) => {
                const state = await read();
                const entry = state.entries.find((item) => item.id === id);
                requireSafe(Boolean(entry), 'reservation-missing');
                Object.assign(entry, evidence);
                await write(state);
            },
        });
    } finally {
        await unlink(lockPath);
        await syncDirectory(lockPath);
    }
}
