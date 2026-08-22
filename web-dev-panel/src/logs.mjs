import { StringDecoder } from 'node:string_decoder';
import { stripVTControlCharacters } from 'node:util';

const sensitiveKeyPattern =
    /(?:^PGPASSWORD$|(?:^|_)(?:AUTH|COOKIE|CREDENTIALS?|DATABASE_URL|DSN|KEY|PASS(?:WORD)?|PAT|PWD|REDIS_URL|SECRET|TOKEN)(?:$|_))/iu;

export function createEnvironmentRedactor(environment = process.env) {
    const values = Object.entries(environment)
        .filter(
            ([key, value]) =>
                sensitiveKeyPattern.test(key) &&
                typeof value === 'string' &&
                value.length > 0,
        )
        .map(([, value]) => value)
        .filter((value, index, entries) => entries.indexOf(value) === index)
        .sort((a, b) => b.length - a.length);
    const redact = (input) => {
        let output = input;
        for (const value of values)
            output = output.split(value).join('[REDACTED]');
        return output;
    };
    redact.maximumSecretLength = Math.max(
        0,
        ...values.map((value) => value.length),
    );
    redact.values = values;
    return redact;
}

export class StreamingRedactor {
    #decoder = new StringDecoder('utf8');
    #onText;
    #pending = '';
    #redact;

    constructor({ onText, redact }) {
        this.#onText = onText;
        this.#redact = redact;
    }

    write(chunk) {
        this.#consume(this.#decoder.write(chunk), false);
    }

    end() {
        this.#consume(this.#decoder.end(), true);
    }

    #consume(text, final) {
        this.#pending += text;
        if (final) {
            if (this.#pending) this.#onText(this.#redact(this.#pending));
            this.#pending = '';
            return;
        }
        const retained = Math.max(0, this.#redact.maximumSecretLength - 1);
        let cut = Math.max(0, this.#pending.length - retained);
        for (const secret of this.#redact.values) {
            const start = this.#pending.lastIndexOf(secret, cut);
            if (start >= 0 && start < cut && start + secret.length > cut)
                cut = start;
        }
        if (cut === 0) return;
        this.#onText(this.#redact(this.#pending.slice(0, cut)));
        this.#pending = this.#pending.slice(cut);
    }
}

export function sanitizeLogText(input, redact = (value) => value) {
    return redact(stripVTControlCharacters(String(input)))
        .split('')
        .filter((character) => {
            const codePoint = character.codePointAt(0);
            return !(
                codePoint <= 0x08 ||
                codePoint === 0x0b ||
                codePoint === 0x0c ||
                (codePoint >= 0x0e && codePoint <= 0x1f) ||
                (codePoint >= 0x7f && codePoint <= 0x9f)
            );
        })
        .join('')
        .slice(0, 8192);
}

export class BoundedLogBuffer {
    #entries = [];
    #maximumBytes;
    #maximumEntries;
    #nextSequence = 1;
    #totalBytes = 0;
    #truncated = false;

    constructor({ maximumBytes = 64 * 1024, maximumEntries = 256 } = {}) {
        this.#maximumBytes = maximumBytes;
        this.#maximumEntries = maximumEntries;
    }

    append({ stream, text, timestamp = new Date().toISOString() }) {
        const entry = {
            sequence: this.#nextSequence,
            stream,
            text,
            timestamp,
        };
        this.#nextSequence += 1;
        const bytes = Buffer.byteLength(JSON.stringify(entry));
        this.#entries.push({ ...entry, bytes });
        this.#totalBytes += bytes;
        while (
            this.#entries.length > this.#maximumEntries ||
            this.#totalBytes > this.#maximumBytes
        ) {
            const removed = this.#entries.shift();
            this.#totalBytes -= removed.bytes;
            this.#truncated = true;
        }
        return entry;
    }

    snapshot() {
        return {
            entries: this.#entries.map(({ bytes: _bytes, ...entry }) => entry),
            truncated: this.#truncated,
        };
    }
}

export class LineDecoder {
    #decoder = new StringDecoder('utf8');
    #onLine;
    #pending = '';

    constructor(onLine) {
        this.#onLine = onLine;
    }

    write(chunk) {
        this.#consume(this.#decoder.write(chunk));
    }

    writeText(text) {
        this.#consume(text);
    }

    end() {
        this.#consume(this.#decoder.end());
        if (this.#pending.length > 0) this.#onLine(this.#pending);
        this.#pending = '';
    }

    #consume(text) {
        this.#pending += text;
        const parts = this.#pending.split(/\r\n|\n|\r/u);
        this.#pending = parts.pop() ?? '';
        for (const line of parts) this.#onLine(line);
        if (this.#pending.length > 8192) {
            this.#onLine(`${this.#pending.slice(0, 8192)} [line truncated]`);
            this.#pending = '';
        }
    }
}
