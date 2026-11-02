import React from 'react';
import type { VideoBlock } from '../../../types/blocks';
import { detectVideo } from '../../../utils/sheetNodes';
import { Field, TitleField } from '../EditorFields';
import { bs } from '../../../data/blockStrings';

interface VideoEditorProps {
  draft: VideoBlock;
  onChange: (next: VideoBlock) => void;
  touch: boolean;
  showErrors: boolean;
}

const looksLikeEmbedCode = (s: string) => /<\s*(iframe|script|embed|object)/i.test(s);

export const videoErrors = (b: VideoBlock) => (b.title.trim() ? 0 : 1) + (detectVideo(b.url) && !looksLikeEmbedCode(b.url) ? 0 : 1);

export function VideoEditor({ draft, onChange, touch, showErrors }: VideoEditorProps) {
  const set = (patch: Partial<VideoBlock>) => onChange({ ...draft, ...patch });
  const info = detectVideo(draft.url);
  const embedCode = looksLikeEmbedCode(draft.url);
  const invalid = draft.url.trim() !== '' && (!info || embedCode);

  return (
    <div className="space-y-4">
      <TitleField value={draft.title} onChange={(title) => set({ title })} touch={touch} invalid={showErrors && !draft.title.trim()} />
      <div>
        <Field
          id="v-url"
          label={bs.video.urlField}
          value={draft.url}
          inputMode="url"
          type="url"
          touch={touch}
          help={bs.video.urlHelp}
          invalid={invalid || (showErrors && !info)}
          error={embedCode ? bs.video.noEmbedCode : bs.video.urlInvalid}
          onChange={(url) => set({ url, unavailable: false })}
        />
        {info && !embedCode && (
          <p className={`mt-1 text-xs font-medium ${info.provider === 'link' ? 'text-warning-default' : 'text-success-default'}`} aria-live="polite">
            {bs.video.detected[info.provider]} · {info.host}
          </p>
        )}
      </div>
      <Field id="v-desc" label={bs.video.descriptionField} value={draft.description} onChange={(description) => set({ description })} touch={touch} multiline rows={3} />
      <Field id="v-transcript" label={bs.video.transcriptField} value={draft.transcript} onChange={(transcript) => set({ transcript })} touch={touch} multiline rows={5} lang="fr" help={bs.video.notWatched} />
    </div>
  );
}

