import assert from 'node:assert/strict';
import net from 'node:net';

const protectedNames = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'DATABASE_URL',
    'DICTIONARY_WORKER_DATABASE_URL',
    'OPENAI_API_KEY',
];

const inheritedSecrets = protectedNames.filter((name) => process.env[name]);
assert.deepEqual(
    inheritedSecrets,
    [],
    'parser sandbox inherited application secrets',
);

const escaped = await new Promise((resolve) => {
    const socket = net.connect({ host: '1.1.1.1', port: 443 });
    const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
    }, 750);
    socket.once('connect', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
    });
    socket.once('error', () => {
        clearTimeout(timer);
        resolve(false);
    });
});

assert.equal(escaped, false, 'parser sandbox reached an external network');
process.stdout.write('{"sandboxProbe":"passed"}\n');
