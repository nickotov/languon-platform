import { Buffer } from 'node:buffer';
import { InvalidDictionaryRequestError } from '../../../application/dictionary-errors';
import type { DictionaryOperationContext } from '../../../application/ports/dictionary-store';

export const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function abort(context: DictionaryOperationContext): void {
    context.signal.throwIfAborted();
}

export function encodeCursor(value: unknown): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor<T>(
    cursor: string | undefined,
    guard: (value: unknown) => value is T,
): T | null {
    if (!cursor) return null;
    try {
        const value: unknown = JSON.parse(
            Buffer.from(cursor, 'base64url').toString('utf8'),
        );

        if (guard(value)) return value;
    } catch {
        // Invalid cursors are deliberately handled as a stable request error.
    }

    throw new InvalidDictionaryRequestError();
}

export function isDictionaryCursor(
    value: unknown,
): value is { id: string; updatedAt: string } {
    if (!value || typeof value !== 'object') return false;
    const cursor = value as Record<string, unknown>;

    return (
        typeof cursor.id === 'string' &&
        uuidPattern.test(cursor.id) &&
        typeof cursor.updatedAt === 'string' &&
        !Number.isNaN(Date.parse(cursor.updatedAt))
    );
}

export function isCardCursor(value: unknown): value is {
    dictionaryVersion: number;
    id: string;
    settingsVersion: number;
    sortKey: string;
} {
    return Boolean(
        value &&
        typeof value === 'object' &&
        typeof (value as Record<string, unknown>).id === 'string' &&
        uuidPattern.test(String((value as Record<string, unknown>).id)) &&
        Number.isSafeInteger(
            (value as Record<string, unknown>).dictionaryVersion,
        ) &&
        Number((value as Record<string, unknown>).dictionaryVersion) > 0 &&
        Number.isSafeInteger(
            (value as Record<string, unknown>).settingsVersion,
        ) &&
        Number((value as Record<string, unknown>).settingsVersion) > 0 &&
        /^\d+$/.test(String((value as Record<string, unknown>).sortKey)),
    );
}

export function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
