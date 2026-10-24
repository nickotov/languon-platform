import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { configure, createAdminClient } from './dev-setup/configure.mjs';
import {
    loadContracts,
    renderProfileDocumentation,
} from './dev-setup/profiles.mjs';
import { grantTestLearner } from './dev-setup/learner-grant.mjs';
import { openTargetBinding } from './dev-setup/target-binding.mjs';

export async function main(args = process.argv.slice(2)) {
    if (args[0] === '--') args = args.slice(1);
    const { values } = parseArgs({
        args,
        options: {
            profile: { type: 'string' },
            origin: { type: 'string' },
            'admin-origin': { type: 'string' },
            apply: { type: 'boolean', default: false },
            'render-docs': { type: 'boolean' },
            'check-docs': { type: 'string' },
            help: { type: 'boolean' },
            'learner-id': { type: 'string' },
            'env-file': { type: 'string' },
            'confirm-database': { type: 'string' },
        },
    });
    if (values.help) {
        console.log(
            'dev:configure --profile <deterministic-demo|deepseek-local-testing> --origin http://localhost:4000 --admin-origin http://localhost:3001 [--apply --env-file <file> --confirm-database <name>] [--learner-id UUID]\nPreview is default. Set LANGUON_DEV_ADMIN_TOKEN in the environment; mutations require recent admin authentication. Optional learner-id grants 100 credits once to an active non-owner .test learner. No generation, account creation or database resets. --render-docs emits preset tables; --check-docs <file> verifies they are included.',
        );
        return;
    }
    if (values['render-docs']) {
        console.log(renderProfileDocumentation());
        return;
    }
    if (values['check-docs']) {
        const content = await readFile(values['check-docs'], 'utf8');
        // Ignore formatter-specific whitespace, preserving field/value order.
        const compact = (text) =>
            text
                .replace(/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/gm, '')
                .replace(/\s+/g, '');
        if (!compact(content).includes(compact(renderProfileDocumentation())))
            throw new Error(
                'Setup documentation does not match the reviewed profile definitions. Regenerate with --render-docs.',
            );
        console.log('Setup profile documentation matches.');
        return;
    }
    const request = createAdminClient({
        origin: values.origin,
        adminOrigin: values['admin-origin'],
        token: process.env.LANGUON_DEV_ADMIN_TOKEN,
    });
    const contracts = await loadContracts();
    const binding = values.apply
        ? await openTargetBinding({
              envFile: values['env-file'],
              confirmedDatabase: values['confirm-database'],
              origin: values.origin,
              request,
              contracts,
          })
        : null;
    const boundRequest = async (...args) => {
        if (args[2] && args[2] !== 'GET') await binding?.verify();
        const result = await request(...args);
        if (args[2] && args[2] !== 'GET') await binding?.verify();
        return result;
    };
    try {
        await binding?.verify();
        await configure({
            profileName: values.profile,
            contracts,
            request: boundRequest,
            apply: values.apply,
            runtimeEnvironment: binding?.env ?? process.env,
        });
        if (values['learner-id'])
            await grantTestLearner({
                learnerId: values['learner-id'],
                contracts,
                request: boundRequest,
                apply: values.apply,
            });
        console.log(
            values.apply
                ? 'Setup requests completed. Run dev:doctor to check runtime readiness. No generation was requested.'
                : 'Preview only. Rerun with --apply to publish the listed changes.',
        );
    } finally {
        await binding?.close();
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : 'Setup failed.');
        process.exitCode = 1;
    });
}
