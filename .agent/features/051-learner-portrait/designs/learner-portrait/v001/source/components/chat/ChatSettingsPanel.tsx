import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InfoIcon, MessageSquarePlusIcon, RotateCcwIcon, SparklesIcon, UserPenIcon } from 'lucide-react';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { InlineAlert } from '../InlineAlert';
import { Select } from '../Select';
import { Switch } from '../Switch';
import { Tabs } from '../Tabs';
import { NEW_CHAT, usePrototype } from '../../contexts/PrototypeContext';
import type { ChatField, ChatMode } from '../../types/portrait';
import { CHAT_FIELDS, effectiveSetting, portraitApplies, portraitValue } from '../../utils/chatSettings';

export function ChatSettingsPanel() {
  const navigate = useNavigate();
  const { portrait, chat, setChat } = usePrototype();
  const [showPrivacy, setShowPrivacy] = useState(false);
  const globalOn = Boolean(portrait?.useEnabled);
  const applies = portraitApplies(portrait, chat);
  const existingNotAdopted = globalOn && !chat.excludePortrait && !chat.isNew && !chat.adoptedPortrait;

  const setField = (field: ChatField, value: string) => setChat((c) => ({ ...c, overrides: { ...c.overrides, [field]: value } }));
  const resetField = (field: ChatField) =>
    setChat((c) => {
      const next = { ...c.overrides };
      delete next[field];
      return { ...c, overrides: next };
    });

  const togglePortrait = (on: boolean) => {
    setChat((c) => ({ ...c, excludePortrait: !on }));
    setShowPrivacy(!on);
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="mode-heading" className="space-y-2">
        <h3 id="mode-heading" className="text-sm font-semibold text-text-primary">
          Mode
        </h3>
        <Tabs
          variant="segmented"
          size="sm"
          fullWidth
          aria-label="Chat mode"
          value={chat.mode}
          onValueChange={(v) => setChat((c) => ({ ...c, mode: v as ChatMode }))}
          items={[
            { value: 'auto', label: 'Auto' },
            { value: 'explain', label: 'Explain' },
            { value: 'correct', label: 'Correct' },
            { value: 'practice', label: 'Practice' },
          ]}
        />
        <p className="text-xs text-text-tertiary">Mode works the same with or without your portrait.</p>
      </section>

      <section aria-labelledby="portrait-chat-heading" className="space-y-3">
        <h3 id="portrait-chat-heading" className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <SparklesIcon className="h-4 w-4 text-primary-default" aria-hidden="true" />
          Learner portrait
        </h3>
        {!portrait ? (
          <InlineAlert tone="info" title="No portrait yet" actions={<Button size="compact" variant="secondary" onClick={() => navigate('/portrait')}>Create a portrait</Button>}>
            This chat uses your manual settings below.
          </InlineAlert>
        ) : (
          <>
            <Switch
              label="Use portrait in this chat"
              description={globalOn ? 'Turn off to leave your portrait out of this chat only.' : 'Unavailable while your portrait is off for all chats.'}
              checked={globalOn && !chat.excludePortrait}
              disabled={!globalOn}
              onCheckedChange={togglePortrait}
            />
            {!globalOn && (
              <InlineAlert
                tone="info"
                title="Your portrait is off for all chats"
                actions={
                  <Button size="compact" variant="secondary" onClick={() => navigate('/portrait')}>
                    Open portrait settings
                  </Button>
                }
              >
                The global setting always wins, so this chat can’t turn it back on. Settings below use your manual choices.
              </InlineAlert>
            )}
            {existingNotAdopted && (
              <InlineAlert
                tone="tip"
                title="This chat keeps its earlier settings"
                actions={
                  <Button size="compact" onClick={() => setChat((c) => ({ ...c, adoptedPortrait: true, overrides: {} }))}>
                    Use portrait preferences
                  </Button>
                }
              >
                It started before your portrait was in use. Apply your portrait’s language, tone, and explanation settings to this chat?
              </InlineAlert>
            )}
            {showPrivacy && chat.excludePortrait && (
              <InlineAlert
                tone="info"
                title="Portrait left out of this chat"
                onDismiss={() => setShowPrivacy(false)}
                actions={
                  <Button
                    size="compact"
                    variant="secondary"
                    leadingIcon={<MessageSquarePlusIcon className="h-4 w-4" />}
                    onClick={() => {
                      setChat({ ...NEW_CHAT, excludePortrait: true });
                      setShowPrivacy(false);
                    }}
                  >
                    Start a fresh chat
                  </Button>
                }
              >
                Your portrait won’t be added to future requests. Earlier messages may still contain personal information.
              </InlineAlert>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="explain-heading" className="space-y-4">
        <div>
          <h3 id="explain-heading" className="text-sm font-semibold text-text-primary">
            Explanations
          </h3>
          <p className="mt-1 flex items-start gap-1.5 text-xs text-text-tertiary">
            <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Changes apply to your next message. A response already underway keeps the settings it started with.
          </p>
        </div>
        {CHAT_FIELDS.map((f) => {
          const eff = effectiveSetting(portrait, chat, f.key);
          const pv = portraitValue(portrait, f.key);
          return (
            <div key={f.key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-text-secondary">Source</span>
                {eff.origin === 'portrait' ? (
                  <Badge size="sm" tone="info" icon={<SparklesIcon />}>
                    From portrait
                  </Badge>
                ) : (
                  <Badge size="sm" tone="neutral" icon={<UserPenIcon />}>
                    Manual
                  </Badge>
                )}
              </div>
              <Select fullWidth size="md" label={f.label} value={eff.value} onChange={(e) => setField(f.key, e.target.value)} options={f.options} />
              {eff.overridden && applies && pv && pv !== eff.value && (
                <button
                  type="button"
                  onClick={() => resetField(f.key)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-xs font-medium text-primary-default outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <RotateCcwIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  Use portrait value
                </button>
              )}
            </div>
          );
        })}
        <p className="text-xs text-text-tertiary">Manual choices and anything you ask for directly in a message take priority over your portrait.</p>
      </section>
    </div>
  );
}

