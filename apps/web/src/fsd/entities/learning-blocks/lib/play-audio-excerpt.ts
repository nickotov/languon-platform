import type { LearningTranscript } from '@languon/contracts';

export type AudioRange = NonNullable<
    LearningTranscript['segments'][number]['timing']
>;

export function excerptRanges(
    transcript: LearningTranscript | undefined,
): AudioRange[] {
    const segments = transcript?.segments ?? [];
    if (!segments.every((segment) => segment.timing)) {
        return [];
    }

    return segments.map((segment) => segment.timing!);
}

const active = new WeakMap<HTMLMediaElement, () => void>();

/** End the bounded listen on the same player that owns the complete recording. */
export function clearAudioExcerpt(media: HTMLMediaElement) {
    active.get(media)?.();
}

export async function playAudioExcerpt(
    media: HTMLAudioElement,
    ranges: readonly AudioRange[],
) {
    clearAudioExcerpt(media);
    let index = 0;
    const first = ranges[0];
    media.currentTime = first?.startSeconds ?? 0;
    if (!first) {
        return media.play();
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    function track() {
        clearTimeout(timer);
        let end = ranges[index]!.endSeconds;
        // Seek past unrelated speech between two separate pieces of answer evidence.
        if (media.currentTime >= end) {
            const next = ranges[++index];
            if (!next) {
                cleanup();
                media.pause();

                return;
            }

            media.currentTime = next.startSeconds;
            end = next.endSeconds;
        }

        if (!media.paused && media.playbackRate > 0) {
            timer = setTimeout(
                track,
                Math.max(
                    30,
                    (1000 * (end - media.currentTime)) / media.playbackRate,
                ),
            );
        }
    }

    function cleanup() {
        clearTimeout(timer);
        media.removeEventListener('timeupdate', track);
        media.removeEventListener('ratechange', track);
        media.removeEventListener('pause', cleanup);
        media.removeEventListener('ended', cleanup);
        media.removeEventListener('error', cleanup);
        active.delete(media);
    }

    active.set(media, cleanup);
    media.addEventListener('timeupdate', track);
    media.addEventListener('ratechange', track);
    media.addEventListener('pause', cleanup);
    media.addEventListener('ended', cleanup);
    media.addEventListener('error', cleanup);
    try {
        await media.play();
        if (active.get(media) === cleanup) {
            track();
        }
    } catch (error) {
        if (active.get(media) === cleanup) {
            cleanup();
        }

        throw error;
    }
}
