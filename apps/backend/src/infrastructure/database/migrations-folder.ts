import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function resolveMigrationsFolder(
    entryPointUrl: string | URL = import.meta.url,
): string {
    const sourceFolder = new URL('../../../drizzle', entryPointUrl);
    const builtFolder = new URL('../../drizzle', entryPointUrl);

    if (existsSync(builtFolder)) {
        return fileURLToPath(builtFolder);
    }

    if (existsSync(sourceFolder)) {
        return fileURLToPath(sourceFolder);
    }

    throw new Error(
        'The checked-in Drizzle migration directory is unavailable.',
    );
}
