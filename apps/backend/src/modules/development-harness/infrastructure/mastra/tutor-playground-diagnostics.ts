import type { requireSupportedTutorModel } from '../../../conversations/infrastructure/ai/contextual-tutor-configuration';

/** Capture only synthetic prompt/result data, never provider config, headers or credential-bearing request objects. */
export function capturePlaygroundModel<
    Model extends ReturnType<typeof requireSupportedTutorModel>,
>(model: Model, records: unknown[]): Model {
    return new Proxy(model, {
        get(target, property) {
            if (property === 'doGenerate') {
                return async (input: Parameters<Model['doGenerate']>[0]) => {
                    const record = capture(input.prompt);
                    const result = await target.doGenerate(input);
                    if (record && 'content' in result) {
                        record.output = JSON.stringify(result.content).slice(
                            0,
                            24_000,
                        );
                    }

                    return result;
                };
            }

            if (property === 'doStream') {
                return async (input: Parameters<Model['doStream']>[0]) => {
                    const record = capture(input.prompt);
                    const result = await target.doStream(input);

                    return {
                        ...result,
                        stream: result.stream.pipeThrough(
                            new TransformStream({
                                transform(part, controller) {
                                    if (record && part.type === 'text-delta') {
                                        record.output = (
                                            record.output + part.delta
                                        ).slice(0, 24_000);
                                    }

                                    controller.enqueue(part);
                                },
                            }),
                        ),
                    };
                };
            }

            const value: unknown = Reflect.get(target, property, target);

            return typeof value === 'function' ? value.bind(target) : value;
        },
    });

    function capture(prompt: unknown) {
        if (records.length >= 5) {
            return;
        }

        const record = {
            input: JSON.stringify(prompt).slice(0, 24_000),
            output: '',
        };

        records.push(record);

        return record;
    }
}
