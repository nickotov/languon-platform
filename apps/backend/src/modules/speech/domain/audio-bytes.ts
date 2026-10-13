export interface AudioBytes {
    bytes: Uint8Array;
    mimeType: 'audio/mpeg' | 'audio/wav';
    checksum: string;
    durationMs?: number;
}
