import { acquireDeployLock } from '../lib/lock.mjs';

const [stateDirectory, identity] = process.argv.slice(2);

try {
    const release = await acquireDeployLock(stateDirectory, identity);
    process.send?.({ status: 'acquired' });
    process.once('message', async (message) => {
        if (message !== 'release') return;
        await release();
        process.exit(0);
    });
} catch (error) {
    process.send?.({ status: 'rejected', message: error.message });
    process.disconnect?.();
}
