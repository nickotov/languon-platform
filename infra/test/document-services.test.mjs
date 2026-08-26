import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);
const composePath = new URL(
    './document-services.compose.yaml',
    import.meta.url,
);

test('document disposable services remain isolated, pinned, and private', async () => {
    const compose = await readFile(composePath, 'utf8');

    assert.match(
        compose,
        /minio\/minio@sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e/,
    );
    assert.match(
        compose,
        /minio\/mc@sha256:aead63c77f9db9107f1696fb08ecb0faeda23729cde94b0f663edf4fe09728e3/,
    );
    assert.match(
        compose,
        /clamav\/clamav@sha256:629a3050df6a706aedb31859fbb8139e9aaf8f56b0ffefbf251b8358a7c9e76c/,
    );
    assert.match(compose, /mc version enable/);
    assert.match(compose, /mc anonymous set none/);
    assert.match(compose, /admin policy attach document-test document-api/);
    assert.match(compose, /admin policy attach document-test document-worker/);
    assert.match(
        compose,
        /MINIO_API_CORS_ALLOW_ORIGIN:.*http:\/\/127\.0\.0\.1:3333.*http:\/\/localhost:3333/,
    );
    assert.match(compose, /127\.0\.0\.1:\$\{DOCUMENT_TEST_CLAMAV_PORT/);
    assert.match(compose, /TCPAddr 0\.0\.0\.0/);
    assert.match(compose, /StreamMaxLength 25M/);
    assert.match(compose, /MaxRecursion 10/);
    assert.match(compose, /MaxFiles 2048/);
    assert.match(compose, /network_mode: none/);
    assert.match(compose, /cap_drop: \[ALL\]/);
    assert.match(compose, /internal: true/);
    assert.doesNotMatch(compose, /BACKUP_S3_URI|BACKUP_/);

    const apiPolicy = await readFile(
        new URL('./document-storage-api-policy.json', import.meta.url),
        'utf8',
    );
    const workerPolicy = await readFile(
        new URL('./document-storage-worker-policy.json', import.meta.url),
        'utf8',
    );
    assert.doesNotMatch(apiPolicy, /DeleteObject/);
    assert.match(workerPolicy, /s3:DeleteObjectVersion/);
    assert.doesNotMatch(apiPolicy + workerPolicy, /s3:\*/);
});

test('generates disposable clean and infected document fixtures at runtime', async () => {
    const { stdout } = await execute('node', [
        fileURLToPath(
            new URL('./generate-document-fixtures.mjs', import.meta.url),
        ),
    ]);
    const { outputDirectory } = JSON.parse(stdout);

    try {
        await assert.doesNotReject(() =>
            readFile(`${outputDirectory}/terms.txt`, 'utf8'),
        );
        assert.equal(
            await readFile(`${outputDirectory}/infected-eicar.txt`, 'utf8'),
            'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
        );
    } finally {
        await rm(outputDirectory, { force: true, recursive: true });
    }
});
