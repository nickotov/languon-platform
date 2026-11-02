import React from 'react';
import { InlineAlert } from '../InlineAlert';
import { Button } from '../Button';
import { DEFAULT_MODEL } from '../../data/models';
import { useTutorContext } from '../../contexts/TutorContext';
import type { SourceInfo } from '../../types/tutor';

export function ComposerAlerts({ source }: { source: SourceInfo }) {
  const { tutor, platform } = useTutorContext();
  const size = platform === 'mobile' ? 'default' : 'compact';
  const { alert, model, flags } = tutor.state;
  const inaccessible = flags.inaccessibleSources.includes(source.id);
  if (!inaccessible && !alert) return null;

  return (
    <div className="mb-2 space-y-2">
      {inaccessible && (
        <InlineAlert tone="warning" title={`“${source.title}” is no longer accessible`}>
          It may have been deleted or moved. Earlier answers stay readable; new questions won’t include its content.
        </InlineAlert>
      )}
      {alert === 'credits' && (
        <InlineAlert
          tone="error"
          title="Not enough credits for another answer"
          onDismiss={tutor.dismissAlert}
          actions={
            <Button size={size} variant="secondary" onClick={tutor.dismissAlert}>
              Get more credits
            </Button>
          }
        >
          Your question and attachments are kept. Editing and saving Knowledge drafts still works.
        </InlineAlert>
      )}
      {alert === 'model' && (
        <InlineAlert
          tone="warning"
          title={`${model} is unavailable right now`}
          onDismiss={tutor.dismissAlert}
          actions={
            <Button size={size} variant="secondary" onClick={() => tutor.setModel(DEFAULT_MODEL)}>
              Switch to {DEFAULT_MODEL}
            </Button>
          }
        >
          Your question hasn’t been sent. Switch models and send again.
        </InlineAlert>
      )}
    </div>
  );
}

