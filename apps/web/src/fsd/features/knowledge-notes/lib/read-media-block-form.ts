import { LearningMediaUrlSchema } from '@languon/contracts';
import type { BlockFormReadContext } from './block-form-read-context';

export function readVideoBlock(context: BlockFormReadContext): unknown {
    const { value, optional, rows, common, previous } = context;
    const kind = 'video';

    const url = new URL(LearningMediaUrlSchema.parse(value('video')));
    let videoId: string | null = null;
    if (
        ['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(
            url.hostname,
        )
    ) {
        videoId = url.searchParams.get('v');
    }

    if (url.hostname === 'youtu.be') {
        videoId = url.pathname.slice(1);
    }

    if (
        [
            'www.youtube.com',
            'youtube.com',
            'm.youtube.com',
            'www.youtube-nocookie.com',
        ].includes(url.hostname)
    ) {
        const embedded = /^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/u.exec(
            url.pathname,
        );

        if (embedded) {
            videoId = embedded[1] ?? null;
        }
    }

    const previousTranscript =
        previous?.type === 'video' ? previous.transcript : undefined;
    const passages = rows('transcript', ['id', 'text', 'start', 'end']);
    const candidate = {
        ...common,
        type: kind,
        ...(optional('description')
            ? { description: value('description') }
            : {}),
        source: videoId
            ? { kind: 'youtube', videoId }
            : { kind: 'url', url: value('video') },
        ...(passages.length
            ? {
                  transcript: {
                      language: value('language'),
                      segments: passages.map((row, index) => ({
                          id:
                              row.id ||
                              previousTranscript?.segments[index]?.id ||
                              crypto.randomUUID(),
                          text: row.text,
                          ...(row.start || row.end
                              ? {
                                    timing: {
                                        startSeconds: Number(row.start),
                                        endSeconds: Number(row.end),
                                    },
                                }
                              : {}),
                      })),
                  },
              }
            : {}),
    };

    return candidate;
}

export function readAudioBlock(context: BlockFormReadContext): unknown {
    const { value, optional, rows, common, previous } = context;
    const kind = 'audio';

    const audio = previous?.type === 'audio' ? previous : undefined;
    const passages = rows('transcript', ['id', 'text', 'start', 'end']);
    const candidate = {
        ...common,
        type: kind,
        language: value('language'),
        ...(audio?.assetId ? { assetId: audio.assetId } : {}),
        ...(optional('sourceText') ? { sourceText: value('sourceText') } : {}),
        ...(passages.length
            ? {
                  transcript: {
                      language:
                          audio?.transcript &&
                          value('language') ===
                              (audio.language ?? audio.transcript.language)
                              ? audio.transcript.language
                              : value('language'),
                      segments: passages.map((row, index) => ({
                          id:
                              row.id ||
                              audio?.transcript?.segments[index]?.id ||
                              crypto.randomUUID(),
                          text: row.text,
                          ...(row.start || row.end
                              ? {
                                    timing: {
                                        startSeconds: Number(row.start),
                                        endSeconds: Number(row.end),
                                    },
                                }
                              : {}),
                      })),
                  },
              }
            : {}),
    };

    return candidate;
}
