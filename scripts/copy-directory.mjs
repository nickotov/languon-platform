import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [sourceArgument, destinationArgument] = process.argv.slice(2);

if (!sourceArgument || !destinationArgument) {
    throw new Error('Usage: copy-directory <source> <destination>');
}

const source = resolve(sourceArgument);
const destination = resolve(destinationArgument);

if (!existsSync(source)) {
    throw new Error(`Source directory does not exist: ${sourceArgument}`);
}

mkdirSync(dirname(destination), { recursive: true });
rmSync(destination, { force: true, recursive: true });
cpSync(source, destination, { recursive: true });
