export interface DocBlock {
  tag: string;
  text: string;
  html: string;
}

/** Split editor HTML into top-level blocks for side-by-side comparison. */
export function htmlBlocks(html: string): DocBlock[] {
  if (typeof window === 'undefined') return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return [];
  return Array.from(root.children).map((el) => ({
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    html: el.outerHTML,
  }));
}

export interface ComparedBlock {
  block: DocBlock;
  changed: boolean;
}

/** Mark blocks that don't appear verbatim in the other version. */
export function compareBlocks(a: DocBlock[], b: DocBlock[]): { left: ComparedBlock[]; right: ComparedBlock[] } {
  const aTexts = new Set(a.map((x) => x.text));
  const bTexts = new Set(b.map((x) => x.text));
  return {
    left: a.map((block) => ({ block, changed: !bTexts.has(block.text) })),
    right: b.map((block) => ({ block, changed: !aTexts.has(block.text) })),
  };
}

export function htmlToText(html: string): string {
  return htmlBlocks(html)
    .map((b) => b.text)
    .join('\n');
}

export function wordCount(html: string): number {
  const text = htmlToText(html).trim();
  return text ? text.split(/\s+/).length : 0;
}

export function formatChars(n: number): string {
  return n.toLocaleString('en-US');
}

