import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, MessageSquarePlusIcon, SendIcon, SlidersHorizontalIcon, SparklesIcon } from 'lucide-react';
import { AiTutorMessage } from '../components/AiTutorMessage';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { IconButton } from '../components/IconButton';
import { Textarea } from '../components/Textarea';
import { UserMessage } from '../components/UserMessage';
import { ChatSettingsPanel } from '../components/chat/ChatSettingsPanel';
import { NEW_CHAT, usePrototype } from '../contexts/PrototypeContext';
import { CHAT_FIELDS, effectiveSetting, portraitApplies, settingLabel } from '../utils/chatSettings';
import { timeLabel } from '../utils/dates';

interface ChatMessage {
  id: string;
  role: 'tutor' | 'user';
  text: string;
  time: string;
  meta?: string;
}

const HISTORY: ChatMessage[] = [
  { id: 'h1', role: 'user', text: '¿Cuál es la diferencia entre “por” y “para” en “Lo compré para mi madre”?', time: 'Yesterday' },
  {
    id: 'h2',
    role: 'tutor',
    text: '“Para” marks the recipient or purpose: Lo compré para mi madre = I bought it for my mother (she receives it). “Por” would suggest on her behalf or because of her.',
    time: 'Yesterday',
  },
];

export function LearningChat() {
  const navigate = useNavigate();
  const { portrait, chat, setChat } = usePrototype();
  const [messages, setMessages] = useState<ChatMessage[]>(chat.fresh ? [] : HISTORY);
  const [text, setText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    setMessages(chat.fresh ? [] : HISTORY);
  }, [chat.fresh]);

  const applies = portraitApplies(portrait, chat);
  const summary = CHAT_FIELDS.slice(1, 5)
    .map((f) => settingLabel(f.key, effectiveSetting(portrait, chat, f.key).value).toLowerCase())
    .join(' · ');

  const send = () => {
    if (!text.trim() || typing) return;
    const snapshot = `${applies ? 'Portrait applied' : 'Manual settings'} · ${summary} · ${chat.mode} mode`;
    setMessages((m) => [...m, { id: `u-${m.length}`, role: 'user', text: text.trim(), time: timeLabel() }]);
    setText('');
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages((m) => [
        ...m,
        {
          id: `t-${m.length}`,
          role: 'tutor',
          text: '¡Buena pregunta! Example: “Voy al mercado por la mañana” — por marks a time of day here. Rule: use por for duration, cause, and exchange.',
          time: timeLabel(),
          meta: snapshot,
        },
      ]);
    }, 1400);
  };

  return (
    <div className="flex min-h-screen w-full flex-col md:min-h-full">
      <header className="flex items-center gap-2 border-b border-border-default bg-background-surface px-2 py-2 sm:px-4">
        <IconButton icon={<ArrowLeftIcon />} label="Back to Texts" variant="ghost" size="lg" onClick={() => navigate('/texts')} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-text-tertiary">Texts · AI chat</p>
          <h1 className="truncate text-base font-semibold text-text-primary">En el mercado</h1>
        </div>
        <span className="hidden items-center gap-1.5 text-xs text-text-secondary sm:flex">
          <SparklesIcon className={`h-4 w-4 ${applies ? 'text-primary-default' : 'text-text-tertiary'}`} aria-hidden="true" />
          {applies ? 'Portrait in use' : 'Portrait not used'}
        </span>
        <Button
          variant="ghost"
          size="compact"
          leadingIcon={<MessageSquarePlusIcon className="h-4 w-4" />}
          onClick={() => {
            setChat({ ...NEW_CHAT, mode: chat.mode, excludePortrait: chat.excludePortrait });
            setMessages([]);
          }}
        >
          <span className="hidden sm:inline">New chat</span>
          <span className="sr-only sm:hidden">New chat</span>
        </Button>
        <div className="lg:hidden">
          <Button variant="secondary" size="compact" leadingIcon={<SlidersHorizontalIcon className="h-4 w-4" />} onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div role="log" aria-label="Chat messages" className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6">
            {chat.fresh && messages.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border-strong p-6 text-center">
                <p className="font-medium text-text-primary">Fresh chat</p>
                <p className="mt-1 text-sm text-text-secondary">
                  {applies ? 'Starts with your portrait preferences.' : 'Starts with your manual settings — your portrait isn’t used here.'}
                </p>
              </div>
            )}
            {messages.map((m) =>
              m.role === 'user' ? (
                <div role="list" key={m.id}>
                  <UserMessage text={m.text} timestamp={m.time} />
                </div>
              ) : (
                <div key={m.id} className="space-y-1">
                  <AiTutorMessage tutorName="Languon" message={m.text} timestamp={m.time} />
                  {m.meta && <p className="pl-12 text-xs text-text-tertiary">Sent with: {m.meta}</p>}
                </div>
              ),
            )}
            {typing && <AiTutorMessage tutorName="Languon" status="typing" />}
          </div>
          <form
            className="sticky bottom-0 border-t border-border-default bg-background-surface p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <div className="min-w-0 flex-1">
                <Textarea label="Message" value={text} rows={1} resize="none" placeholder="Ask about this text…" onChange={(e) => setText(e.target.value)} />
              </div>
              <Button type="submit" leadingIcon={<SendIcon className="h-4 w-4" />} disabled={!text.trim() || typing}>
                Send
              </Button>
            </div>
          </form>
        </div>
        <aside aria-label="Chat settings" className="hidden w-80 shrink-0 border-l border-border-default bg-background-surface p-5 lg:block">
          <h2 className="mb-4 text-base font-semibold text-text-primary">Chat settings</h2>
          <ChatSettingsPanel />
        </aside>
      </div>
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Chat settings" size="md">
        <ChatSettingsPanel />
      </Dialog>
    </div>
  );
}

