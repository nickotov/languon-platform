import { useCallback, useEffect, useRef, useState } from 'react';
import { CORE_TOPICS, INTERVIEW_COPY } from '../../data/interviewCopy';
import { INTERVIEW_LANGUAGES } from '../../data/portraitOptions';
import { usePrototype } from '../../contexts/PrototypeContext';
import type { CostMode, ErrorKind, Interview, InterviewMessage, LangCode, PortraitItems, TopicId } from '../../types/portrait';
import { TODAY, timeLabel } from '../../utils/dates';
import { compactAnswer, containsDiagnosticLabel, uid } from '../../utils/text';

type Reply = (iv: Interview, costTag: string) => Interview;

const UNRELATED = /\b(weather|recipe for|news|stock|bitcoin|joke|capital of|football score|write (me )?(an?|my) (essay|email|poem|code)|homework|translate this|tax(es)?)\b/i;
const CLARIFY = /(what does|what do you mean|what is|meaning of|mean\?|explain|qu[eé] significa|что значит|que veut dire)/i;
const SWITCH: [RegExp, LangCode][] = [
  [/(spanish|español|espanol|испанск)/i, 'es'],
  [/(french|français|francais|франц)/i, 'fr'],
  [/(russian|русск|ruso|russe)/i, 'ru'],
  [/(english|inglés|anglais|английск)/i, 'en'],
];
const SWITCH_INTENT = /(switch|continue|speak|talk|change|let'?s|seguimos|cambia|continuons|переключ|давайте|продолж)/i;

function msg(partial: Omit<InterviewMessage, 'id' | 'time'>): InterviewMessage {
  return { id: uid('m'), time: timeLabel(), ...partial };
}

function nextTopic(iv: Interview, after: TopicId): Pick<Interview, 'phase' | 'topic'> {
  if (iv.mode === 'update') return { phase: 'update-pick', topic: after };
  if (after === 'interests') return { phase: 'questions', topic: 'age' };
  if (after === 'age') return { phase: 'done', topic: after };
  const remaining = CORE_TOPICS.filter((t) => t !== after && !iv.topicStatus[t]);
  if (remaining.length) return { phase: 'questions', topic: remaining[0] };
  return { phase: 'deeper-offer', topic: after };
}

function questionText(iv: Interview, lead: string): string {
  const copy = INTERVIEW_COPY[iv.language];
  if (iv.phase === 'questions') return `${lead} ${copy.questions[iv.topic].title}`.trim();
  if (iv.phase === 'deeper-offer') return `${lead} ${copy.deeperOffer}`.trim();
  if (iv.phase === 'update-pick') return `${lead} ${iv.language === 'en' ? 'Anything else you’d like to update?' : copy.updateGreeting}`.trim();
  return `${lead} ${copy.done}`.trim();
}

export function useInterviewEngine() {
  const proto = usePrototype();
  const { interview, setInterview, costMode, credits, setCredits, aiStatus, paidNoticePending } = proto;
  const [generating, setGenerating] = useState<{ cost: CostMode } | null>(null);
  const [costNotice, setCostNotice] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(new Map<string, () => void>());
  const pending = useRef<(() => void) | null>(null);
  const lastRequest = useRef<(() => void) | null>(null);
  const live = useRef({ costMode, credits, aiStatus, paidNoticePending });
  live.current = { costMode, credits, aiStatus, paidNoticePending };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const push = useCallback(
    (...messages: InterviewMessage[]) => setInterview((iv) => (iv ? { ...iv, messages: [...iv.messages, ...messages] } : iv)),
    [setInterview],
  );

  const requestAI = useCallback(
    (userMsgId: string | null, reply: Reply) => {
      const { costMode: cm, credits: cr, aiStatus: status, paidNoticePending: notice } = live.current;
      const run = () => requestAI(userMsgId, reply);
      if (cm === 'paid' && notice) {
        pending.current = run;
        setCostNotice(true);
        return;
      }
      if (cm === 'paid' && cr < 1) {
        const m = msg({ role: 'system', kind: 'error', errorKind: 'credits', text: 'You don’t have enough credits for the next interviewer response. Your answer is kept.' });
        retries.current.set(m.id, run);
        push(m);
        return;
      }
      setGenerating({ cost: cm });
      timer.current = setTimeout(() => {
        timer.current = null;
        setGenerating(null);
        setInterview((iv) => {
          if (!iv) return iv;
          const effective: ErrorKind | 'ok' = iv.contextUsed >= 100 ? 'context' : status;
          if (effective === 'ok') {
            if (cm === 'paid') setCredits(Math.max(0, live.current.credits - 1));
            const next = reply(iv, cm === 'paid' ? '1 credit' : 'Free');
            return { ...next, lastActivityAt: TODAY.toISOString(), contextUsed: next.contextUsed + 9 };
          }
          const errText: Record<ErrorKind, string> = {
            unavailable: 'The interviewer is unavailable right now. Your answer is kept — try again in a moment, or keep editing your draft by hand.',
            offline: 'Connection lost before your message reached the interviewer. Nothing was charged. Your message is kept.',
            interrupted: 'The response was interrupted partway through. Your answer is kept.',
            context: 'This interview has grown too long to continue. Your draft and edits are kept. Shorten long answers, review your draft, or start a new interview from your draft.',
            credits: '',
          };
          const m = msg({ role: 'system', kind: 'error', errorKind: effective, text: errText[effective] });
          retries.current.set(m.id, run);
          const messages = iv.messages.map((x) => (effective === 'offline' && x.id === userMsgId ? { ...x, status: 'error' as const } : x));
          if (effective === 'interrupted') messages.push(msg({ role: 'interviewer', kind: 'reply', text: 'Thanks — so for the next part, I’d like to…' }));
          return { ...iv, messages: [...messages, m] };
        });
      }, 1600);
    },
    [push, setCredits, setInterview],
  );

  const retry = useCallback(
    (messageId: string) => {
      const fn = retries.current.get(messageId);
      if (!fn || generating) return;
      retries.current.delete(messageId);
      setInterview((iv) =>
        iv
          ? {
              ...iv,
              messages: iv.messages.map((m) =>
                m.id === messageId ? { ...m, resolved: true } : m.status === 'error' ? { ...m, status: 'sent' as const } : m,
              ),
            }
          : iv,
      );
      fn();
    },
    [generating, setInterview],
  );

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const started = generating;
    setGenerating(null);
    const m = msg({
      role: 'system',
      kind: 'stopped',
      text: `Response stopped. Your answer is kept.${started?.cost === 'paid' ? ' No credits were used.' : ''}`,
    });
    push(m);
    // The original request can be resent explicitly ("Ask again"), never automatically.
    if (lastRequest.current) retries.current.set(m.id, lastRequest.current);
  }, [generating, push]);
  const tracked = useCallback(
    (userMsgId: string | null, reply: Reply) => {
      lastRequest.current = () => requestAI(userMsgId, reply);
      requestAI(userMsgId, reply);
    },
    [requestAI],
  );

  const submitAnswer = useCallback(
    (topic: TopicId, label: string, apply: (d: PortraitItems) => PortraitItems) => {
      const userMsg = msg({ role: 'user', kind: 'answer', text: label, status: 'sent' });
      setInterview((iv) =>
        iv
          ? {
              ...iv,
              draft: apply(iv.draft),
              topicStatus: { ...iv.topicStatus, [topic]: 'answered' },
              messages: [...iv.messages, userMsg],
              lastActivityAt: TODAY.toISOString(),
            }
          : iv,
      );
      tracked(userMsg.id, (iv, costTag) => {
        const copy = INTERVIEW_COPY[iv.language];
        const nt = nextTopic(iv, topic);
        const moved = { ...iv, ...nt };
        const ack = copy.acks[Object.keys(iv.topicStatus).length % copy.acks.length];
        return { ...moved, messages: [...iv.messages, msg({ role: 'interviewer', kind: 'question', text: questionText(moved, ack), costTag })] };
      });
    },
    [setInterview, tracked],
  );

  /** Skipping never needs an AI response — the next guided question is local. */
  const skipTopic = useCallback(
    (topic: TopicId) => {
      setInterview((iv) => {
        if (!iv) return iv;
        const copy = INTERVIEW_COPY[iv.language];
        const withStatus = { ...iv, topicStatus: { ...iv.topicStatus, [topic]: 'skipped' as const } };
        const moved = { ...withStatus, ...nextTopic(withStatus, topic) };
        return {
          ...moved,
          lastActivityAt: TODAY.toISOString(),
          messages: [
            ...iv.messages,
            msg({ role: 'user', kind: 'answer', text: 'Skipped', status: 'sent' }),
            msg({ role: 'interviewer', kind: 'question', text: questionText(moved, copy.skipAck) }),
          ],
        };
      });
    },
    [setInterview],
  );

  const chooseDeeper = useCallback(
    (yes: boolean) => {
      setInterview((iv) => {
        if (!iv) return iv;
        const moved: Interview = yes ? { ...iv, phase: 'questions', topic: 'interests' } : { ...iv, phase: 'done' };
        return {
          ...moved,
          messages: [
            ...iv.messages,
            msg({ role: 'user', kind: 'answer', text: yes ? 'Yes, go deeper' : 'No thanks', status: 'sent' }),
            msg({ role: 'interviewer', kind: 'question', text: questionText(moved, '') }),
          ],
        };
      });
    },
    [setInterview],
  );

  const pickUpdateTopic = useCallback(
    (topic: TopicId, label: string) => {
      setInterview((iv) => {
        if (!iv) return iv;
        const moved: Interview = { ...iv, phase: 'questions', topic };
        return {
          ...moved,
          messages: [
            ...iv.messages,
            msg({ role: 'user', kind: 'answer', text: label, status: 'sent' }),
            msg({ role: 'interviewer', kind: 'question', text: questionText(moved, '') }),
          ],
        };
      });
    },
    [setInterview],
  );

  const finishUpdate = useCallback(() => {
    setInterview((iv) => (iv ? { ...iv, phase: 'done', messages: [...iv.messages, msg({ role: 'interviewer', kind: 'question', text: INTERVIEW_COPY[iv.language].done })] } : iv));
  }, [setInterview]);

  const switchLanguage = useCallback(
    (lang: LangCode) => {
      setInterview((iv) => {
        if (!iv || iv.language === lang) return iv;
        const copy = INTERVIEW_COPY[lang];
        const moved = { ...iv, language: lang };
        return {
          ...moved,
          messages: [
            ...iv.messages,
            msg({ role: 'system', kind: 'notice', text: `Interview language changed to ${INTERVIEW_LANGUAGES.find((l) => l.value === lang)?.english}. Your explanation-language preferences are unchanged.` }),
            msg({ role: 'interviewer', kind: 'question', text: questionText(moved, copy.switched) }),
          ],
        };
      });
    },
    [setInterview],
  );

  const sendChat = useCallback(
    (text: string) => {
      if (!interview) return;
      const userMsg = msg({ role: 'user', kind: 'chat', text, status: 'sent' });
      push(userMsg);
      const topic = interview.topic;
      tracked(userMsg.id, (iv, costTag) => {
        const copy = INTERVIEW_COPY[iv.language];
        const say = (t: string, kind: InterviewMessage['kind'] = 'reply') => msg({ role: 'interviewer', kind, text: t, costTag });

        const switchTo = SWITCH_INTENT.test(text) ? SWITCH.find(([re]) => re.test(text))?.[1] : undefined;
        if (switchTo && switchTo !== iv.language) {
          const moved = { ...iv, language: switchTo };
          return {
            ...moved,
            messages: [
              ...iv.messages,
              msg({ role: 'system', kind: 'notice', text: `Interview language changed to ${INTERVIEW_LANGUAGES.find((l) => l.value === switchTo)?.english}. Your explanation-language preferences are unchanged.` }),
              say(questionText(moved, INTERVIEW_COPY[switchTo].switched)),
            ],
          };
        }
        if (UNRELATED.test(text)) {
          return { ...iv, messages: [...iv.messages, say(copy.redirect, 'redirect')] };
        }
        if (CLARIFY.test(text) && text.includes('?')) {
          const answer = /example/i.test(text) || /ejemplo|exemple|пример/i.test(text) ? copy.clarifyExamples : copy.clarifyGeneric;
          return { ...iv, messages: [...iv.messages, say(answer)] };
        }
        if (containsDiagnosticLabel(text)) {
          const p = {
            id: uid('p'),
            topic: 'needs' as TopicId,
            text: /focus|attention|concentrat/i.test(text)
              ? 'Short steps with frequent recaps help me stay focused.'
              : /read|spell|letters/i.test(text)
                ? 'Clear structure and short paragraphs make reading easier for me.'
                : 'One concept at a time, explained in short steps.',
            sourceQuote: text.length > 120 ? `${text.slice(0, 117)}…` : text,
            shortened: false,
          };
          return { ...iv, proposals: [...iv.proposals, p], messages: [...iv.messages, msg({ role: 'interviewer', kind: 'proposal', text: copy.diagnosisIntro, proposalId: p.id, costTag })] };
        }
        const compact = compactAnswer(text);
        const p = { id: uid('p'), topic, text: compact.text, sourceQuote: text.length > 120 ? `${text.slice(0, 117)}…` : text, shortened: compact.shortened };
        return { ...iv, proposals: [...iv.proposals, p], messages: [...iv.messages, msg({ role: 'interviewer', kind: 'proposal', text: copy.proposalIntro, proposalId: p.id, costTag })] };
      });
    },
    [interview, push, tracked],
  );

  const confirmCostNotice = useCallback(() => {
    proto.acknowledgePaidNotice();
    live.current.paidNoticePending = false;
    setCostNotice(false);
    const fn = pending.current;
    pending.current = null;
    fn?.();
  }, [proto]);

  const cancelCostNotice = useCallback(() => {
    setCostNotice(false);
    pending.current = null;
    push(msg({ role: 'system', kind: 'notice', text: 'No request was sent. Your answer is kept — you can keep editing your draft by hand.' }));
  }, [push]);

  const hasRetry = useCallback((id: string) => retries.current.has(id), []);

  return {
    generating,
    costNotice,
    confirmCostNotice,
    cancelCostNotice,
    submitAnswer,
    skipTopic,
    chooseDeeper,
    pickUpdateTopic,
    finishUpdate,
    switchLanguage,
    sendChat,
    stop,
    retry,
    hasRetry,
  };
}

