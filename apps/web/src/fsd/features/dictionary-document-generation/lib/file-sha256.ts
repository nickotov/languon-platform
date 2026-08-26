export async function fileSha256(file: Blob): Promise<string> {
    const bytes = await file.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);

    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
}
