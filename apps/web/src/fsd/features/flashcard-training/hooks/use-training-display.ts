import { useCallback, useEffect, useRef, useState } from 'react';

export function requestTrainingFullscreen(): Promise<boolean> {
    if (document.fullscreenElement) return Promise.resolve(true);
    try {
        const request = document.documentElement.requestFullscreen?.();
        return request
            ? request.then(
                  () => true,
                  () => false,
              )
            : Promise.resolve(false);
    } catch {
        return Promise.resolve(false);
    }
}

export function exitTrainingFullscreen() {
    if (document.fullscreenElement)
        void document.exitFullscreen().catch(() => undefined);
}

/** Presentation changes never own or reset a practice queue. */
export function useTrainingDisplay(fullscreenRequest: Promise<boolean>) {
    const [mode, setMode] = useState<'fullscreen' | 'overlay' | 'dialog'>(
        'overlay',
    );
    const [notice, setNotice] = useState(false);
    const lifecycle = useRef(0);
    const mounted = useRef(true);

    useEffect(() => {
        let alive = true;
        void fullscreenRequest.then((granted) => {
            if (!alive) {
                if (granted && !mounted.current) exitTrainingFullscreen();
                return;
            }
            setMode(granted ? 'fullscreen' : 'overlay');
            setNotice(!granted);
        });
        return () => {
            alive = false;
        };
    }, [fullscreenRequest]);

    useEffect(() => {
        const generation = ++lifecycle.current;
        mounted.current = true;
        function handleChange() {
            if (!document.fullscreenElement)
                setMode((current) =>
                    current === 'fullscreen' ? 'dialog' : current,
                );
        }
        document.addEventListener('fullscreenchange', handleChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleChange);
            // StrictMode replays mount effects before microtasks run. Only a real
            // unmount may release the fullscreen acquired by the Start gesture.
            queueMicrotask(() => {
                if (lifecycle.current === generation) {
                    mounted.current = false;
                    exitTrainingFullscreen();
                }
            });
        };
    }, []);

    const toDialog = useCallback(() => {
        setMode('dialog');
        exitTrainingFullscreen();
    }, []);
    const toFullscreen = useCallback(() => {
        void requestTrainingFullscreen().then((granted) => {
            if (!mounted.current) {
                if (granted) exitTrainingFullscreen();
                return;
            }
            setMode(granted ? 'fullscreen' : 'overlay');
            setNotice(!granted);
        });
    }, []);
    function dismissNotice() {
        setNotice(false);
    }

    return { mode, notice, toDialog, toFullscreen, dismissNotice };
}
