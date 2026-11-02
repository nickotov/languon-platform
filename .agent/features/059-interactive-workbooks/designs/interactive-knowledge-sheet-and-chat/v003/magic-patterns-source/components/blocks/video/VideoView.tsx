import React, { useState } from 'react';
import { AlertCircleIcon, ChevronDownIcon, ExternalLinkIcon, FilmIcon, Loader2Icon, PlayIcon } from 'lucide-react';
import type { BlockVariant, VideoBlock } from '../../../types/blocks';
import { useBlockRuntime } from '../../../contexts/BlockRuntimeContext';
import { detectVideo } from '../../../utils/sheetNodes';
import { bs } from '../../../data/blockStrings';

interface VideoViewProps {
  block: VideoBlock;
  variant: BlockVariant;
}

/**
 * Safe player: a poster until the person presses Play (never autoplays in a preview). Only YouTube and
 * direct video files embed; other sites stay links. Playback doesn't imply the tutor understood the video.
 */
export function VideoView({ block, variant }: VideoViewProps) {
  const rt = useBlockRuntime();
  const [stage, setStage] = useState<'poster' | 'loading' | 'playing'>('poster');
  const [showTranscript, setShowTranscript] = useState(variant === 'review');
  const info = detectVideo(block.url);
  const compact = variant === 'compact';

  const start = () => {
    rt.stop();
    setStage('loading');
    window.setTimeout(() => setStage('playing'), 500);
  };

  const sourceLink = info && (
    <a
      href={block.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1 text-xs font-medium text-primary-default underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      {bs.video.openSource}
      <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
    </a>
  );

  let frame: React.ReactNode;
  if (!info) {
    frame = <p className="rounded-lg bg-background-subtle px-3 py-2 text-sm text-text-secondary">{bs.video.urlInvalid}</p>;
  } else if (block.unavailable) {
    frame = (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl bg-background-subtle px-6 text-center">
        <AlertCircleIcon className="h-5 w-5 text-warning-default" aria-hidden="true" />
        <p className="text-sm text-text-secondary">{bs.video.unavailable}</p>
        {sourceLink}
      </div>
    );
  } else if (info.provider === 'link') {
    frame = (
      <div className="flex items-center gap-3 rounded-xl border border-border-default px-3 py-2.5">
        <FilmIcon className="h-5 w-5 shrink-0 text-text-tertiary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{block.title}</p>
          <p className="text-xs text-text-tertiary">{bs.video.unsupported}</p>
        </div>
        {sourceLink}
      </div>
    );
  } else if (stage === 'playing') {
    frame =
      info.provider === 'youtube' ? (
        <iframe
          title={block.title}
          src={info.embed}
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full rounded-xl border-0 bg-neutral-950"
        />
      ) : (
        <video src={info.embed} controls autoPlay playsInline onError={() => setStage('poster')} className="aspect-video w-full rounded-xl bg-neutral-950">
          <track kind="captions" />
        </video>
      );
  } else {
    frame = (
      <button
        type="button"
        onClick={start}
        aria-label={bs.video.play(block.title)}
        className={`group/poster relative flex w-full items-center justify-center rounded-xl bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 ${compact ? 'aspect-[21/9]' : 'aspect-video'}`}
      >
        <span className="absolute left-3 top-2.5 max-w-[80%] truncate text-left text-xs font-medium text-neutral-300">{block.title}</span>
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-neutral-50 text-neutral-900 transition-transform group-hover/poster:scale-105">
          {stage === 'loading' ? <Loader2Icon className="h-5 w-5 animate-spin" aria-hidden="true" /> : <PlayIcon className="ml-0.5 h-5 w-5" aria-hidden="true" />}
        </span>
        {stage === 'loading' && <span className="sr-only">{bs.video.loading}</span>}
      </button>
    );
  }

  return (
    <div className="space-y-2 py-1">
      {frame}
      {info && info.provider !== 'link' && !block.unavailable && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-tertiary">
          <span>{bs.video.source(info.host)}</span>
          {sourceLink}
        </div>
      )}
      {!compact && block.description && (
        <div>
          <p className="text-xs font-semibold text-text-tertiary">{bs.video.description}</p>
          <p className="text-sm leading-6 text-text-secondary">{block.description}</p>
        </div>
      )}
      {block.transcript ? (
        !compact && (
          <div>
            <button
              type="button"
              aria-expanded={showTranscript}
              onClick={() => setShowTranscript((s) => !s)}
              className={`-ml-2 inline-flex items-center gap-1.5 rounded-md px-2 text-xs font-medium text-text-secondary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${rt.touch ? 'h-11' : 'h-7'}`}
            >
              <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${showTranscript ? 'rotate-180' : ''}`} aria-hidden="true" />
              {bs.video.transcript}
            </button>
            {showTranscript && (
              <p lang="fr" className="mt-1 whitespace-pre-line border-l-2 border-border-default pl-3 text-sm leading-6 text-text-primary">
                {block.transcript}
              </p>
            )}
          </div>
        )
      ) : (
        <p className="text-xs text-text-tertiary">{bs.video.noTranscript}</p>
      )}
      {(variant === 'author' || variant === 'review') && <p className="text-xs text-text-tertiary">{bs.video.notWatched}</p>}
    </div>
  );
}

