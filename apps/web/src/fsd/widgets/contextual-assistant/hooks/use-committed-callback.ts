import { useCallback, useLayoutEffect, useRef } from 'react';

export function useCommittedCallback<TArguments extends unknown[], TResult>(
    callback: (...arguments_: TArguments) => TResult,
): (...arguments_: TArguments) => TResult;
export function useCommittedCallback<TArguments extends unknown[], TResult>(
    callback: ((...arguments_: TArguments) => TResult) | undefined,
): ((...arguments_: TArguments) => TResult) | undefined;
export function useCommittedCallback<TArguments extends unknown[], TResult>(
    callback: ((...arguments_: TArguments) => TResult) | undefined,
) {
    const committed = useRef(callback);

    useLayoutEffect(() => {
        committed.current = callback;
    }, [callback]);

    const invoke = useCallback(
        (...arguments_: TArguments) => committed.current?.(...arguments_),
        [],
    );

    return callback ? invoke : undefined;
}
