import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { z } from 'zod';

const UserIdSchema = z.uuid();
const EventSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('blocking'), userId: UserIdSchema, userVersion: z.number().int().positive(), occurredAt: z.iso.datetime() }),
    z.object({ kind: z.literal('committed'), userId: UserIdSchema, userVersion: z.number().int().positive(), occurredAt: z.iso.datetime() }),
    z.object({ kind: z.literal('cancellation'), userId: UserIdSchema, userVersion: z.number().int().positive(), occurredAt: z.iso.datetime() }),
    z.object({ kind: z.literal('sentinel'), namespace: z.string().min(1).max(100) }),
]);
const EnvelopeSchema = z.object({
    version: z.literal(1),
    nonce: z.base64(),
    ciphertext: z.base64(),
    tag: z.base64(),
});

export type JournalEvent = z.infer<typeof EventSchema>;

export function parseJournalKey(encoded: string): Buffer {
    if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error('Invalid deletion journal encryption key.');
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('Invalid deletion journal encryption key.');
    return key;
}

export function encryptJournalEvent(event: JournalEvent, key: Buffer, objectKey: string): Buffer {
    const validated = EventSchema.parse(event);
    if (key.length !== 32) throw new Error('Invalid deletion journal encryption key.');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(`languon-deletion-journal:v1:${objectKey}`));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(validated), 'utf8'), cipher.final()]);
    return Buffer.from(JSON.stringify({
        version: 1,
        nonce: nonce.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
    }));
}

export function decryptJournalEvent(body: Uint8Array, key: Buffer, objectKey: string): JournalEvent {
    if (key.length !== 32 || body.byteLength > 2048) throw new Error('Invalid deletion journal object.');
    const envelope = EnvelopeSchema.parse(JSON.parse(Buffer.from(body).toString('utf8')));
    const nonce = Buffer.from(envelope.nonce, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    if (nonce.length !== 12 || tag.length !== 16) throw new Error('Invalid deletion journal object.');
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(`languon-deletion-journal:v1:${objectKey}`));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final(),
    ]);
    return EventSchema.parse(JSON.parse(plaintext.toString('utf8')));
}
