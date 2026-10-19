import { serve } from '@hono/node-server';
import { setTimeout as delay } from 'node:timers/promises';
import { AuthenticationSuccessResponseSchema } from '@languon/contracts';
import { createContextualAssistantFixture } from './contextual-assistant-fixture';

const fixture = await createContextualAssistantFixture();
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
const server = serve({
    port: 4006,
    hostname: '127.0.0.1',
    fetch: async (request) => {
        const response = await fixture.app.fetch(request);
        if (
            new URL(request.url).pathname ===
                '/auth/email-verification/verify' &&
            response.status === 200
        )
            await fixture.credit(
                AuthenticationSuccessResponseSchema.parse(
                    await response.clone().json(),
                ).accessToken,
            );
        return response;
    },
});
console.log('Contextual assistant test fixture ready at http://127.0.0.1:4006');
try {
    while (!controller.signal.aborted) {
        await fixture.conversations.worker!.processNext(controller.signal);
        await delay(30);
    }
} finally {
    server.close();
    await fixture.close();
}
