import type { ExerciseItem, SheetBlock, SheetNode, VideoProvider } from '../types/blocks';

let seq = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Order and content of every block and text line; the main prose is tracked separately as HTML. Empty lines don't count as changes. */
export function serializeBlocks(nodes: SheetNode[]): string {
  return JSON.stringify(
    nodes.flatMap((n) => (n.kind === 'prose' ? ['prose'] : n.kind === 'block' ? [n.block] : hasText(n.html) ? [{ text: n.html }] : [])),
  );
}

export const htmlText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
export const hasText = (html: string) => htmlText(html).length > 0;

const gapNode = (): SheetNode => ({ kind: 'text', id: newId('t'), html: '' });

/**
 * Every block is followed by a writable line, so there is always somewhere to put the caret between
 * blocks and at the end of the sheet. Empty lines that no longer follow a block are dropped; lines with
 * text always stay where they are.
 */
export function normalizeNodes(list: SheetNode[]): SheetNode[] {
  const out: SheetNode[] = [];
  list.forEach((n, i) => {
    if (n.kind === 'text' && !hasText(n.html) && out[out.length - 1]?.kind !== 'block') return;
    out.push(n);
    if (n.kind === 'block') {
      const next = list[i + 1];
      if (!next || next.kind === 'block') out.push(gapNode());
    }
  });
  return out;
}

export const blockKey = (block: SheetBlock) => JSON.stringify(block);

export function blocksOf(nodes: SheetNode[]): SheetBlock[] {
  return nodes.flatMap((n) => (n.kind === 'block' ? [n.block] : []));
}

const itemText = (i: ExerciseItem) => `${i.prompt} ${i.choices?.join(' / ') ?? ''} → ${i.answer}. ${i.explanation}`;

/** Plain text the tutor receives for a block as part of the sheet snapshot. */
export function blockText(block: SheetBlock): string {
  switch (block.type) {
    case 'vocabulary':
      return [block.title, ...block.entries.map((e) => [e.term, e.translation, e.definition, e.example, e.exampleTranslation].filter(Boolean).join(' — '))].join('\n');
    case 'exercises':
      return [block.title, ...block.items.map(itemText)].join('\n');
    case 'grammar':
      return [block.title, block.rule, block.pattern, ...block.examples.map((e) => `${e.source} — ${e.translation}`), ...block.mistakes.map((m) => `${m.wrong} → ${m.right} (${m.reason})`)]
        .filter(Boolean)
        .join('\n');
    case 'bilingual':
      return [block.title, ...block.segments.map((s) => [s.source, ...block.prepared.map((l) => s.translations[l])].filter(Boolean).join(' — '))].join('\n');
    case 'audio':
      return [block.title, ...block.transcript.map((l) => l.text), ...block.questions.map(itemText)].join('\n');
    case 'video':
      return [block.title, block.url, block.description, block.transcript].filter(Boolean).join('\n');
  }
}

const freshItems = (items: ExerciseItem[]) => items.map((i) => ({ ...i, id: newId('e'), version: 1 }));

/** Independent copy: new identities everywhere, no learner history. */
export function cloneBlock(block: SheetBlock): SheetBlock {
  const id = newId('b');
  switch (block.type) {
    case 'vocabulary':
      return { ...block, id, entries: block.entries.map((e) => ({ ...e, id: newId('v') })) };
    case 'exercises':
      return { ...block, id, items: freshItems(block.items) };
    case 'grammar':
      return { ...block, id, examples: block.examples.map((e) => ({ ...e, id: newId('g') })), mistakes: block.mistakes.map((m) => ({ ...m, id: newId('g') })) };
    case 'bilingual':
      return { ...block, id, segments: block.segments.map((s) => ({ ...s, id: newId('s') })) };
    case 'audio':
      return { ...block, id, transcript: block.transcript.map((l) => ({ ...l, id: newId('t') })), questions: freshItems(block.questions) };
    case 'video':
      return { ...block, id };
  }
}

const material = (i: ExerciseItem) => JSON.stringify([i.kind, i.prompt, i.choices ?? [], i.answer, i.alternatives ?? []]);

const bump = (before: ExerciseItem[], after: ExerciseItem[]) =>
  after.map((item) => {
    const prev = before.find((p) => p.id === item.id);
    return prev && material(prev) !== material(item) ? { ...item, version: prev.version + 1 } : item;
  });

/** Material changes start a fresh exercise version; explanation-only fixes keep progress. */
export function bumpChangedVersions(before: SheetBlock, after: SheetBlock): SheetBlock {
  if (before.type === 'exercises' && after.type === 'exercises') return { ...after, items: bump(before.items, after.items) };
  if (before.type === 'audio' && after.type === 'audio') return { ...after, questions: bump(before.questions, after.questions) };
  return after;
}

/** Only YouTube and directly playable files embed; everything else stays an ordinary link. */
export function detectVideo(url: string): { provider: VideoProvider; embed?: string; host: string } | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');
  const yt = host === 'youtu.be' ? u.pathname.slice(1) : host.endsWith('youtube.com') ? u.searchParams.get('v') : null;
  if (yt && /^[\w-]{6,}$/.test(yt)) return { provider: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1`, host };
  if (/\.(mp4|webm|ogv)$/i.test(u.pathname)) return { provider: 'file', embed: u.toString(), host };
  return { provider: 'link', host };
}

export const proseNode: SheetNode = { kind: 'prose', id: 'prose' };
export const blockNode = (block: SheetBlock): SheetNode => ({ kind: 'block', id: block.id, block });

