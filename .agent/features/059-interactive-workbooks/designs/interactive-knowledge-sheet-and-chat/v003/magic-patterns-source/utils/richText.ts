import type { Block } from '../types/tutor';

export interface Segment {
  text: string;
  bold: boolean;
  em: boolean;
}

const INLINE = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;

export function parseInline(src: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(src))) {
    if (match.index > last) out.push({ text: src.slice(last, match.index), bold: false, em: false });
    if (match[2] !== undefined) out.push({ text: match[2], bold: true, em: false });
    else out.push({ text: match[3], bold: false, em: true });
    last = match.index + match[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last), bold: false, em: false });
  return out;
}

export function inlinePlain(src: string): string {
  return parseInline(src)
    .map((s) => s.text)
    .join('');
}

export function truncateSegments(segments: Segment[], limit: number): Segment[] {
  if (limit === Infinity) return segments;
  const out: Segment[] = [];
  let left = limit;
  for (const seg of segments) {
    if (left <= 0) break;
    if (seg.text.length <= left) {
      out.push(seg);
      left -= seg.text.length;
    } else {
      out.push({ ...seg, text: seg.text.slice(0, left) });
      left = 0;
    }
  }
  return out;
}

export function blockPlain(block: Block): string {
  switch (block.type) {
    case 'h':
    case 'p':
      return inlinePlain(block.text);
    case 'ul':
    case 'ol':
      return block.items.map(inlinePlain).join('');
    case 'example':
      return inlinePlain(block.source) + (block.translation ? inlinePlain(block.translation) : '');
    case 'table':
      return [...block.head, ...block.rows.flat()].map(inlinePlain).join('');
  }
}

const plainCache = new WeakMap<Block[], string>();

export function blocksPlain(blocks: Block[]): string {
  const cached = plainCache.get(blocks);
  if (cached !== undefined) return cached;
  const plain = blocks.map(blockPlain).join('');
  plainCache.set(blocks, plain);
  return plain;
}

export function blocksLength(blocks: Block[]): number {
  return blocksPlain(blocks).length;
}

/** Next reveal boundary: advance roughly one or two words at a time. */
export function chunkEnd(blocks: Block[], revealed: number): number {
  const plain = blocksPlain(blocks);
  if (revealed >= plain.length) return plain.length;
  let i = Math.min(plain.length, revealed + 4);
  while (i < plain.length && i < revealed + 18 && plain[i] !== ' ') i++;
  return Math.min(plain.length, i + 1);
}

/** Readable plain-text version for copying. */
export function blocksToText(blocks: Block[], revealed?: number): string {
  const lines: string[] = [];
  let offset = 0;
  for (const b of blocks) {
    const len = blockPlain(b).length;
    if (revealed !== undefined && offset >= revealed) break;
    offset += len;
    switch (b.type) {
      case 'h':
        lines.push(inlinePlain(b.text).toUpperCase());
        break;
      case 'p':
        lines.push(inlinePlain(b.text));
        break;
      case 'ul':
        b.items.forEach((it) => lines.push(`• ${inlinePlain(it)}`));
        break;
      case 'ol':
        b.items.forEach((it, i) => lines.push(`${i + 1}. ${inlinePlain(it)}`));
        break;
      case 'example':
        lines.push(inlinePlain(b.source));
        if (b.translation) lines.push(`   → ${inlinePlain(b.translation)}`);
        break;
      case 'table':
        lines.push(b.head.map(inlinePlain).join(' | '));
        b.rows.forEach((r) => lines.push(r.map(inlinePlain).join(' | ')));
        break;
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

/** Lightweight markdown used by Knowledge notes and drafts. */
export function markdownToBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: list.type, items: list.items });
    list = null;
  };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    if (line.startsWith('## ')) {
      flushPara();
      flushList();
      blocks.push({ type: 'h', text: line.slice(3) });
    } else if (line.startsWith('- ')) {
      flushPara();
      if (!list || list.type !== 'ul') {
        flushList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(line.slice(2));
    } else if (/^\d+\.\s/.test(line)) {
      flushPara();
      if (!list || list.type !== 'ol') {
        flushList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(line.replace(/^\d+\.\s/, ''));
    } else if (line.startsWith('> ')) {
      flushPara();
      flushList();
      const [source, translation] = line.slice(2).split(' — ');
      blocks.push({ type: 'example', source, translation });
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}

export function isRtl(text: string): boolean {
  return /[\u0590-\u08FF]/.test(text);
}

