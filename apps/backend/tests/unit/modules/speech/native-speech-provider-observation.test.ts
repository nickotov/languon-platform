import { describe, expect, it, vi } from 'vitest';
import { KieSpeechProvider } from '../../../../src/modules/speech/infrastructure/audio/speech-providers';
import { createFixtureAudio } from '../../../../src/modules/speech/domain/audio-integrity';
import {
    KIE_GEMINI_MODEL,
    GEMINI_PRONUNCIATION_SETTINGS_VERSION,
} from '../../../../src/modules/speech/domain/speech-models';
import {
    SpeechTaskFailedError,
    SpeechOutputUnavailableError,
} from '../../../../src/modules/speech/application/ports/speech-synthesis-provider';

const profile = {
    configurationId: 'native-kie-test',
    provider: 'kie',
    model: KIE_GEMINI_MODEL,
    voice: 'Bodi',
    language: 'fr',
    settingsVersion: GEMINI_PRONUNCIATION_SETTINGS_VERSION,
    estimatedCostUnitsPerCharacter: 1,
};
function fixture(overrides: Record<string, unknown> = {}) {
    const data = {
        taskId: 'native-task',
        model: KIE_GEMINI_MODEL,
        state: 'success',
        creditsConsumed: 1.23,
        costTime: 12345,
        resultJson: JSON.stringify({
            resultUrls: ['https://cdn.example.test/audio.mp3'],
        }),
        ...overrides,
    };
    const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ code: 200, data }));
    const download = vi.fn().mockResolvedValue(createFixtureAudio());
    const provider = new KieSpeechProvider({
        configurationId: profile.configurationId,
        apiKey: 'synthetic',
        profiles: { fr: profile },
        allowedDownloadHosts: ['cdn.example.test'],
        fetch: fetcher,
        download,
    });
    return { provider, fetcher, download };
}
describe('native Kie speech expense observations', () => {
    it('retains actual reported credits without inventing token or audio-duration usage', async () => {
        const f = fixture();
        const result = await f.provider.poll({
            taskId: 'native-task',
            profile,
        });
        expect(result).toMatchObject({
            state: 'ready',
            usage: { requests: 1, providerCreditsConsumed: '1.23' },
        });
        if (result.state !== 'ready')
            throw new Error('Expected synthesized output.');
        expect(result.usage).not.toHaveProperty('audioOutputTokens');
        expect(result.usage).not.toHaveProperty('inputTokens');
        expect(result.audio.durationMs).not.toBe(12345);
    });
    it('retains a definitive failed task zero-credit observation without exposing provider diagnostics', async () => {
        const f = fixture({
            state: 'fail',
            creditsConsumed: 0,
            failMsg: 'private provider failure',
        });
        const result = f.provider.poll({ taskId: 'native-task', profile });
        await expect(result).rejects.toBeInstanceOf(SpeechTaskFailedError);
        await expect(result).rejects.toMatchObject({
            observation: {
                usage: { requests: 1, providerCreditsConsumed: '0' },
            },
        });
        await expect(result).rejects.not.toHaveProperty('failMsg');
        expect(f.download).not.toHaveBeenCalled();
    });
    it('leaves missing provider credits unknown while retaining valid output', async () => {
        const f = fixture({ creditsConsumed: undefined });
        const result = await f.provider.poll({
            taskId: 'native-task',
            profile,
        });
        expect(result.state).toBe('ready');
        expect(result).not.toHaveProperty('usage');
    });
    it('preserves a billed task observation when its audio cannot yet be downloaded', async () => {
        const f = fixture();
        f.download.mockRejectedValueOnce(new Error('Synthetic CDN outage'));
        const result = f.provider.poll({ taskId: 'native-task', profile });
        await expect(result).rejects.toBeInstanceOf(
            SpeechOutputUnavailableError,
        );
        await expect(result).rejects.toMatchObject({
            observation: {
                usage: { requests: 1, providerCreditsConsumed: '1.23' },
            },
        });
    });
    it.each([-1, 1e-7, 1_000_001, '1.23'])(
        'rejects invalid or non-representable credit observation %s',
        async (creditsConsumed) => {
            const f = fixture({ creditsConsumed });
            await expect(
                f.provider.poll({ taskId: 'native-task', profile }),
            ).rejects.toThrow();
            expect(f.download).not.toHaveBeenCalled();
        },
    );
    it('never binds another task credits to the admitted task', async () => {
        const f = fixture({ taskId: 'another-task' });
        await expect(
            f.provider.poll({ taskId: 'native-task', profile }),
        ).rejects.toThrow('Mismatched');
        expect(f.download).not.toHaveBeenCalled();
    });
});
