import { stripVTControlCharacters } from 'node:util';
import { BoundedLogBuffer, LineDecoder } from '../web-dev-panel/src/logs.mjs';

/** Accept only already-redacted text. Retain a bounded tail for opaque failures. */
export function createDevelopmentOutput({
    verbose,
    stdout,
    stderr,
    service = false,
    isStopping = () => false,
}) {
    let reportedDiagnostic = false;
    const tail = new BoundedLogBuffer({
        maximumBytes: 48 * 1024,
        maximumEntries: 80,
    });
    const decoders = Object.fromEntries(
        ['stdout', 'stderr'].map((stream) => [
            stream,
            new LineDecoder((line) => {
                tail.append({ stream, text: line });
                if (verbose) return;
                const plain = stripVTControlCharacters(line);
                if (
                    /Environment settings absent; using configured fallbacks:/.test(
                        plain,
                    )
                )
                    return;
                if (
                    isStopping() &&
                    /ELIFECYCLE|ERR_PNPM_RECURSIVE|^Exit status\b/.test(plain)
                )
                    return;
                if (
                    (service && stream === 'stderr' && plain.trim()) ||
                    /\b(?:\w*error|warn(?:ing)?|fatal|failed|panic|exception|unhandled)\b|^BLOCKED\b/i.test(
                        plain,
                    )
                ) {
                    reportedDiagnostic = true;
                    stderr.write(`${line}\n`);
                } else if (
                    /\bbackend listening on\b|\bLocal:\s+https?:\/\//i.test(
                        plain,
                    )
                ) {
                    stdout.write(`${line}\n`);
                }
            }),
        ]),
    );
    return {
        write(stream, text) {
            if (verbose) (stream === 'stderr' ? stderr : stdout).write(text);
            decoders[stream].writeText(text);
        },
        end() {
            for (const decoder of Object.values(decoders)) decoder.end();
        },
        failure({ onlyIfSilent = false } = {}) {
            if (verbose || (onlyIfSilent && reportedDiagnostic)) return;
            for (const entry of tail.snapshot().entries)
                stderr.write(`${entry.text}\n`);
        },
    };
}
