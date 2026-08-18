#!/usr/bin/env node
import { main } from '../infra/deploy/cli.mjs';

const values = process.argv.slice(2);
const command = values[0]?.startsWith('--') ? 'deploy' : values.shift();

main([command || 'deploy', ...values]).catch((error) => {
    process.stderr.write(`Deployment failed: ${error.message}\n`);
    process.exitCode = 1;
});
