import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outputDirectory = await mkdtemp(
    join(tmpdir(), 'languon-document-fixtures-'),
);

await Promise.all([
    writeFile(
        join(outputDirectory, 'terms.txt'),
        'canvas\nbank\nriver bank\n',
        'utf8',
    ),
    writeFile(
        join(outputDirectory, 'terms.md'),
        '# Terms\n\n- canvas\n- river bank\n\n## Ignore this heading\n\nplain phrase\n',
        'utf8',
    ),
    writeFile(
        join(outputDirectory, 'infected-eicar.txt'),
        'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
        'utf8',
    ),
]);

process.stdout.write(`${JSON.stringify({ outputDirectory })}\n`);
