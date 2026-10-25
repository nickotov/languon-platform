import { access } from 'node:fs/promises';
import { flows, validateRegistry } from './critical-flows/registry.mjs';
validateRegistry();
for (const flow of flows) {
    if (flow.app === 'backend') {
        for (const file of flow.files) await access(`apps/backend/${file}`);
        continue;
    }
    const app = flow.app === 'admin' ? 'admin' : 'web';
    await access(`apps/${app}/tests/e2e/${flow.file}`);
}
console.log(
    `Critical flow registry valid: ${flows.length} required journeys with existing test files.`,
);
