import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquarePlusIcon } from 'lucide-react';
import { Button } from '../Button';
import { InlineAlert } from '../InlineAlert';
import { Switch } from '../Switch';
import { NEW_CHAT, usePrototype } from '../../contexts/PrototypeContext';

export function PortraitUseControl() {
  const navigate = useNavigate();
  const { portrait, setUseEnabled, setChat, showToast } = usePrototype();
  const [justDisabled, setJustDisabled] = useState(false);
  if (!portrait) return null;

  const change = (on: boolean) => {
    setUseEnabled(on);
    setJustDisabled(!on);
    showToast(
      on
        ? { variant: 'success', title: 'Portrait in use', description: 'New chats will use your preferences.' }
        : { variant: 'info', title: 'Portrait turned off', description: 'Your portrait is still saved.' },
    );
  };

  return (
    <section aria-labelledby="use-heading" className="rounded-2xl border border-border-default bg-background-surface p-4 sm:p-6">
      <h2 id="use-heading" className="sr-only">
        Use in chats
      </h2>
      <Switch
        label="Use my portrait"
        description={
          portrait.useEnabled
            ? 'On for all chats. New chats start with your preferences; existing chats keep their settings until you choose to apply it.'
            : 'Off. Your portrait is saved but isn’t added to any chat.'
        }
        checked={portrait.useEnabled}
        onCheckedChange={change}
      />
      {justDisabled && !portrait.useEnabled && (
        <div className="mt-4">
          <InlineAlert
            tone="info"
            title="Portrait turned off"
            onDismiss={() => setJustDisabled(false)}
            actions={
              <Button
                size="compact"
                variant="secondary"
                leadingIcon={<MessageSquarePlusIcon className="h-4 w-4" />}
                onClick={() => {
                  setChat(NEW_CHAT);
                  navigate('/texts/en-el-mercado');
                }}
              >
                Start a fresh chat
              </Button>
            }
          >
            Your portrait won’t be added to future requests. Earlier messages may still contain personal information.
          </InlineAlert>
        </div>
      )}
    </section>
  );
}

