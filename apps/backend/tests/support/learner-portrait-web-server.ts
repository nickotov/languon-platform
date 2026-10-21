import { serve } from '@hono/node-server';
import { setTimeout as delay } from 'node:timers/promises';
import { AuthenticationSuccessResponseSchema } from '@languon/contracts';
import { createLearnerPortraitWebFixture } from './learner-portrait-web-fixture';

const fixture = await createLearnerPortraitWebFixture('http://localhost:3337');
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
const server = serve({
    port: 4007,
    hostname: '127.0.0.1',
    fetch: async (request) => {
        const response = await fixture.app.fetch(request);
        if (
            new URL(request.url).pathname ===
                '/auth/email-verification/verify' &&
            response.status === 200
        ) {
            const authenticated = AuthenticationSuccessResponseSchema.parse(
                await response.clone().json(),
            );
            await fixture.credit(
                authenticated.accessToken,
                authenticated.user.primaryEmail,
            );
        }
        return response;
    },
});
console.log('Learner portrait web test fixture ready at http://127.0.0.1:4007');
try {
    while (!controller.signal.aborted) {
        await fixture.conversations.worker!.processNext(controller.signal);
        await fixture.portraitWorker.processNext(controller.signal);
        await delay(30);
    }
} finally {
    server.close();
    await fixture.close();
}
