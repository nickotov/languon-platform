/** Code-owned production route. Price discovery and dispatch use this same identity. */
export const KNOWLEDGE_TRANSCRIPTION_MODEL = {
    providerId: 'openai',
    modelId: 'gpt-transcribe',
    meter: 'audio-duration',
    credentialReference: 'OPENAI_API_KEY',
    endpoint: 'https://api.openai.com/v1/audio/transcriptions',
    endpointId: '/v1/audio/transcriptions',
    officialModelUrl:
        'https://developers.openai.com/api/docs/models/gpt-transcribe.md',
    maximumBytes: 5_242_880,
    maximumDurationMs: 1_800_000,
    providerBillingRulesVerified: false,
} as const;
