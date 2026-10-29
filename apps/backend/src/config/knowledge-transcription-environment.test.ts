import { describe, expect, it, vi } from 'vitest';
import { loadKnowledgeTranscriptionEnvironment } from './knowledge-transcription-environment';
describe('Transcription credential configuration', () => {
    it('keeps absent optional credentials quiet', () => {
        const diagnostics = { warn: vi.fn(), error: vi.fn() };
        expect(
            loadKnowledgeTranscriptionEnvironment({}, diagnostics)
                .OPENAI_API_KEY,
        ).toBeUndefined();
        expect(diagnostics.warn).not.toHaveBeenCalled();
        expect(diagnostics.error).not.toHaveBeenCalled();
    });
    it('rejects malformed credentials without exposing their value', () => {
        const diagnostics = { warn: vi.fn(), error: vi.fn() };
        expect(() =>
            loadKnowledgeTranscriptionEnvironment(
                { OPENAI_API_KEY: 'private credential value' },
                diagnostics,
            ),
        ).toThrow();
        expect(JSON.stringify(diagnostics.error.mock.calls)).not.toContain(
            'private credential value',
        );
    });
});
