/** Reserve UTF-8 bytes as a token upper bound, including SDK request framing. */
export function textCallInputTokenBound(options: {
    prompt: unknown;
    tools?: unknown;
    responseFormat?: unknown;
}): number {
    return (
        Buffer.byteLength(
            JSON.stringify({
                prompt: options.prompt,
                tools: options.tools,
                responseFormat: options.responseFormat,
            }),
            'utf8',
        ) + 256
    );
}
