import {
    expect,
    type BrowserContext,
    type Page,
    type Locator,
} from '@playwright/test';

type AudioEvidence = { url: string; byteLength: number; checksum: string };

/** Observe a clone of real browser responses; never mock transport or audio. */
export async function installSpeechAudioProbe(context: BrowserContext) {
    await context.addInitScript(() => {
        const state = window as Window & {
            speechAudioEvidence?: AudioEvidence[];
            speechAudioPlayed?: number;
        };
        state.speechAudioEvidence = [];
        const originalPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
            this.addEventListener(
                'playing',
                () => {
                    state.speechAudioPlayed =
                        (state.speechAudioPlayed ?? 0) + 1;
                },
                { once: true },
            );
            return originalPlay.call(this);
        };
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (...input: Parameters<typeof fetch>) => {
            const response = await originalFetch(...input);
            const path = new URL(response.url).pathname;
            if (
                response.ok &&
                /\/speech\/playbacks\/[^/]+\/content$/.test(path)
            ) {
                void response
                    .clone()
                    .arrayBuffer()
                    .then(async (bytes) => {
                        const digest = await crypto.subtle.digest(
                            'SHA-256',
                            bytes,
                        );
                        const checksum = Array.from(
                            new Uint8Array(digest),
                            (point) => point.toString(16).padStart(2, '0'),
                        ).join('');
                        state.speechAudioEvidence?.push({
                            url: response.url,
                            byteLength: bytes.byteLength,
                            checksum,
                        });
                    })
                    .catch(() => {
                        /* An intentionally cancelled selection has no complete bytes. */
                    });
            }
            return response;
        };
    });
}

export async function browserAudioEvidence(page: Page, url: string) {
    async function read() {
        return page.evaluate((selected) => {
            const state = window as Window & {
                speechAudioEvidence?: AudioEvidence[];
                speechAudioPlayed?: number;
            };
            return (
                state.speechAudioEvidence?.findLast(
                    (item) => item.url === selected,
                ) ?? null
            );
        }, url);
    }
    await expect.poll(read).not.toBeNull();
    const result = await read();
    if (!result)
        throw new Error(
            'The real browser did not receive pronunciation bytes.',
        );
    expect(result.byteLength).toBeGreaterThan(44);
    expect(new URL(result.url).origin).toBe(new URL(page.url()).origin);
    expect(new URL(result.url).pathname).toMatch(/^\/api\/speech\/playbacks\//);
    return result;
}

export async function playSpeechControl(
    page: Page,
    control: Locator,
    kind: string,
) {
    await expect(control).toBeVisible();
    const before = await page.evaluate(
        () =>
            (window as Window & { speechAudioPlayed?: number })
                .speechAudioPlayed ?? 0,
    );
    const preparation = page.waitForResponse(
        (value) =>
            value.url().endsWith('/speech/prepare') &&
            [200, 202].includes(value.status()),
    );
    const bytes = page.waitForResponse(
        (value) =>
            value.url().includes('/speech/playbacks/') &&
            value.url().endsWith('/content') &&
            value.status() === 200,
    );
    await control.click();
    const admitted = await preparation;
    expect(admitted.request().postDataJSON().source.kind).toBe(kind);
    expect((await admitted.json()).quote).toBeNull();
    const response = await bytes;
    await browserAudioEvidence(page, response.url());
    expect(response.headers()['cache-control']).toContain('no-store');
    await expect
        .poll(async () => {
            if (
                await page
                    .getByText('Audio is ready. Press Play.', { exact: true })
                    .isVisible()
            )
                await control.click();
            return page.evaluate(
                () =>
                    (window as Window & { speechAudioPlayed?: number })
                        .speechAudioPlayed ?? 0,
            );
        })
        .toBeGreaterThan(before);
}
