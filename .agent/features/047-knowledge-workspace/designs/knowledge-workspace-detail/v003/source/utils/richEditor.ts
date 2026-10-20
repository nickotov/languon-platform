/**
 * Lightweight rich-text editor built on contentEditable + native editing commands.
 * Native commands keep the browser's own undo stack, so every applied change is one undo step.
 * Remembered tutor targets are live DOM Ranges, which the browser keeps mapped through edits,
 * so moving the cursor never redirects a target.
 */

export const PENDING = 'pending';

export interface TargetRange {
  range: Range;
  original: string;
}

export interface SelectionInfo {
  range: Range;
  text: string;
  heading: string;
}

export type BlockTag = 'P' | 'H1' | 'H2' | 'H3';

const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'LI', 'TD', 'TH', 'DIV', 'UL', 'OL', 'TABLE']);

/** Normalize HTML the way the editor serializes it, so dirty checks are reliable. */
export function normalizeHtml(html: string): string {
  const clean = html.replace(/\n\s*/g, '').trim();
  if (!clean) return '<p><br></p>';
  if (typeof document === 'undefined') return clean;
  const t = document.createElement('template');
  t.innerHTML = clean;
  return t.innerHTML;
}

type HighlightRegistry = { set: (name: string, h: unknown) => void; delete: (name: string) => void };
type HighlightCtor = new (...ranges: Range[]) => unknown;

export class RichEditor {
  el: HTMLDivElement | null = null;
  onChange: (() => void) | null = null;
  onSelect: (() => void) | null = null;
  onMount: ((editor: RichEditor) => void) | null = null;
  private html: string;
  private saved: Range | null = null;
  private targetMap = new Map<string, TargetRange>();
  private activeId: string | null = null;

  constructor(initialHtml: string) {
    this.html = normalizeHtml(initialHtml);
  }

  /** Stable ref callback for the contentEditable element. */
  mount = (el: HTMLDivElement | null) => {
    if (el === this.el) return;
    if (this.el) this.html = this.el.innerHTML;
    this.el = el;
    if (!el) return;
    el.innerHTML = this.html;
    this.targetMap.clear();
    this.activeId = null;
    this.paintHighlights();
    this.updateEmpty();
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      /* unsupported */
    }
    this.onMount?.(this);
  };

  // ---------- content ----------
  getHTML(): string {
    return this.el ? this.el.innerHTML : this.html;
  }

  getText(): string {
    if (this.el) return this.el.textContent ?? '';
    const t = document.createElement('template');
    t.innerHTML = this.html;
    return t.content.textContent ?? '';
  }

  get isEmpty(): boolean {
    if (this.getText().trim()) return false;
    return !(this.el?.querySelector('table, hr') ?? null);
  }

  setContent(html: string) {
    this.html = normalizeHtml(html);
    this.targetMap.clear();
    this.activeId = null;
    this.paintHighlights();
    if (this.el) this.el.innerHTML = this.html;
    this.handleInput();
  }

  handleInput = () => {
    if (this.el) {
      if (!this.el.firstChild) this.el.innerHTML = '<p><br></p>';
      this.html = this.el.innerHTML;
    }
    this.updateEmpty();
    this.onChange?.();
  };

  private updateEmpty() {
    if (this.el) this.el.dataset.empty = String(this.isEmpty && !this.el.querySelector('ul, ol, blockquote, h1, h2, h3'));
  }

  // ---------- selection ----------
  private selectionRange(): Range | null {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !this.el) return null;
    const r = sel.getRangeAt(0);
    return this.el.contains(r.commonAncestorContainer) ? r : null;
  }

  /** Called on document selectionchange. */
  handleSelectionChange = () => {
    const r = this.selectionRange();
    if (r) this.saved = r.cloneRange();
    this.onSelect?.();
  };

  hasFocus(): boolean {
    return !!this.el && document.activeElement === this.el;
  }

  private select(range: Range) {
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  private endRange(): Range {
    const r = document.createRange();
    if (this.el) {
      r.selectNodeContents(this.el.lastElementChild ?? this.el);
      r.collapse(false);
    }
    return r;
  }

  focus(where?: 'end') {
    if (!this.el) return;
    this.el.focus({ preventScroll: true });
    if (where === 'end') {
      this.select(this.endRange());
      return;
    }
    if (this.selectionRange()) return;
    this.select(this.saved && this.el.contains(this.saved.commonAncestorContainer) ? this.saved : this.endRange());
  }

  blur() {
    this.el?.blur();
  }

  selectionInfo(): SelectionInfo | null {
    const r = this.selectionRange() ?? (this.saved && !this.saved.collapsed ? this.saved : null);
    if (!r || r.collapsed) return null;
    const text = r.toString();
    if (!text.trim()) return null;
    return { range: r.cloneRange(), text, heading: this.headingBefore(r.startContainer) };
  }

  collapseSelectionToEnd() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && this.selectionRange()) sel.collapseToEnd();
    if (this.saved) this.saved.collapse(false);
  }

  /** Remembered cursor (collapsed), or the document end. */
  cursorRange(): Range {
    const r = this.selectionRange() ?? this.saved;
    if (r && this.el?.contains(r.commonAncestorContainer)) {
      const c = r.cloneRange();
      c.collapse(false);
      return c;
    }
    return this.endRange();
  }

  selectionRect(): DOMRect | null {
    const r = this.selectionRange();
    if (!r || r.collapsed) return null;
    const rect = r.getBoundingClientRect();
    return rect.width || rect.height ? rect : null;
  }

  // ---------- structure helpers ----------
  private topBlock(node: Node): HTMLElement | null {
    if (!this.el) return null;
    let n: Node | null = node;
    while (n && n.parentNode !== this.el) n = n.parentNode;
    return n instanceof HTMLElement ? n : null;
  }

  private closest(node: Node | null, test: (el: HTMLElement) => boolean): HTMLElement | null {
    let n: Node | null = node;
    while (n && n !== this.el) {
      if (n instanceof HTMLElement && test(n)) return n;
      n = n.parentNode;
    }
    return null;
  }

  private headingBefore(node: Node): string {
    let block: Element | null = this.topBlock(node);
    while (block) {
      if (/^H[1-3]$/.test(block.tagName)) return block.textContent ?? 'Selected passage';
      block = block.previousElementSibling;
    }
    return 'Selected passage';
  }

  /** Text of the innermost block around a point, split at the point. */
  blockContext(range: Range): { before: string; after: string; atEnd: boolean } {
    const block = this.closest(range.endContainer, (e) => BLOCK_TAGS.has(e.tagName) && !['UL', 'OL', 'TABLE'].includes(e.tagName)) ?? this.topBlock(range.endContainer);
    if (!block) return { before: '', after: '', atEnd: true };
    const pre = document.createRange();
    pre.selectNodeContents(block);
    pre.setEnd(range.endContainer, range.endOffset);
    const post = document.createRange();
    post.selectNodeContents(block);
    post.setStart(range.endContainer, range.endOffset);
    const after = post.toString();
    return { before: pre.toString(), after, atEnd: after.trim() === '' };
  }

  lastBlockText(): string {
    return this.el?.lastElementChild?.textContent ?? '';
  }

  findTextRange(needle: string): Range | null {
    if (!this.el) return null;
    const walker = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node) {
      const idx = node.data.indexOf(needle);
      if (idx >= 0) {
        const r = document.createRange();
        r.setStart(node, idx);
        r.setEnd(node, idx + needle.length);
        return r;
      }
      node = walker.nextNode() as Text | null;
    }
    return null;
  }

  /** Programmatic text change (simulates an edit made elsewhere); live ranges stay mapped. */
  replaceText(find: string, replace: string) {
    const r = this.findTextRange(find);
    if (!r) return;
    (r.startContainer as Text).replaceData(r.startOffset, find.length, replace);
    this.handleInput();
  }

  scrollToRange(range: Range) {
    const node = range.startContainer;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }

  /** Keep the caret above overlays such as a bottom sheet or keyboard. */
  ensureCaretVisible(bottomInset: number) {
    const r = this.selectionRange();
    const scroller = this.el?.closest('.overflow-y-auto') as HTMLElement | null;
    if (!r || !scroller) return;
    const rects = r.getClientRects();
    const rect = rects.length ? rects[rects.length - 1] : r.getBoundingClientRect();
    if (!rect.height && !rect.width) return;
    const box = scroller.getBoundingClientRect();
    const limit = box.bottom - bottomInset - 32;
    if (rect.bottom > limit) scroller.scrollTop += rect.bottom - limit;
    else if (rect.top < box.top + 24) scroller.scrollTop -= box.top + 24 - rect.top;
  }

  // ---------- formatting ----------
  private run(cmd: string, value?: string) {
    this.focus();
    try {
      document.execCommand('styleWithCSS', false, 'false');
    } catch {
      /* ignore */
    }
    document.execCommand(cmd, false, value);
    this.handleInput();
  }

  private runAt(range: Range, cmd: string, value?: string) {
    if (!this.el) return;
    this.el.focus({ preventScroll: true });
    this.select(range);
    document.execCommand(cmd, false, value);
    this.handleInput();
  }

  isActive(name: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'insertUnorderedList' | 'insertOrderedList' | 'blockquote' | 'link' | 'table'): boolean {
    const r = this.selectionRange() ?? this.saved;
    if (!r || !this.el?.contains(r.commonAncestorContainer)) return false;
    if (name === 'blockquote') return !!this.closest(r.startContainer, (e) => e.tagName === 'BLOCKQUOTE');
    if (name === 'link') return !!this.closest(r.startContainer, (e) => e.tagName === 'A');
    if (name === 'table') return !!this.closest(r.startContainer, (e) => e.tagName === 'TABLE');
    if (!this.selectionRange()) return false;
    try {
      return document.queryCommandState(name);
    } catch {
      return false;
    }
  }

  blockTag(): BlockTag {
    const r = this.selectionRange() ?? this.saved;
    if (!r) return 'P';
    const h = this.closest(r.startContainer, (e) => /^H[1-3]$/.test(e.tagName));
    return (h?.tagName as BlockTag | undefined) ?? 'P';
  }

  hasSelection(): boolean {
    const r = this.selectionRange() ?? this.saved;
    return !!r && !r.collapsed;
  }

  toggleMark(cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough') {
    this.run(cmd);
  }

  toggleList(kind: 'ul' | 'ol') {
    this.run(kind === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
  }

  setBlock(tag: BlockTag) {
    const current = this.blockTag();
    this.run('formatBlock', `<${current === tag ? 'p' : tag.toLowerCase()}>`);
  }

  toggleQuote() {
    this.run('formatBlock', this.isActive('blockquote') ? '<p>' : '<blockquote>');
  }

  linkHref(): string {
    const r = this.selectionRange() ?? this.saved;
    const a = r ? this.closest(r.startContainer, (e) => e.tagName === 'A') : null;
    return a?.getAttribute('href') ?? '';
  }

  setLink(href: string) {
    const r = this.saved;
    const a = r ? this.closest(r.startContainer, (e) => e.tagName === 'A') : null;
    if (a) {
      a.setAttribute('href', href);
      this.handleInput();
      return;
    }
    if (r && !r.collapsed) this.runAt(r, 'createLink', href);
    const link = this.saved ? this.closest(this.saved.startContainer, (e) => e.tagName === 'A') : null;
    link?.setAttribute('rel', 'noopener noreferrer');
  }

  unsetLink() {
    const r = this.saved;
    const a = r ? this.closest(r.startContainer, (e) => e.tagName === 'A') : null;
    if (!a) return;
    const range = document.createRange();
    range.selectNodeContents(a);
    this.runAt(range, 'unlink');
  }

  insertTable() {
    this.run(
      'insertHTML',
      '<table><tbody><tr><th>Column</th><th>Column</th><th>Column</th></tr><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>',
    );
  }

  undo() {
    this.run('undo');
  }

  redo() {
    this.run('redo');
  }

  // ---------- proposal application (each is one native undo step) ----------
  replaceRange(range: Range, html: string) {
    this.runAt(range.cloneRange(), 'insertHTML', html);
  }

  insertInline(at: Range, html: string) {
    const r = at.cloneRange();
    r.collapse(false);
    this.runAt(r, 'insertHTML', html);
  }

  insertAfterBlock(at: Range, html: string) {
    const block = this.topBlock(at.endContainer);
    if (!block) {
      this.append(html);
      return;
    }
    const r = document.createRange();
    r.setStartAfter(block);
    r.collapse(true);
    this.runAt(r, 'insertHTML', html);
  }

  append(html: string) {
    if (!this.el) return;
    const r = document.createRange();
    r.selectNodeContents(this.el);
    r.collapse(false);
    this.runAt(r, 'insertHTML', html);
  }

  // ---------- remembered targets ----------
  setTarget(id: string, range: Range, original: string) {
    this.targetMap.set(id, { range: range.cloneRange(), original });
    this.paintHighlights();
  }

  getTarget(id: string): TargetRange | undefined {
    return this.targetMap.get(id);
  }

  renameTarget(from: string, to: string) {
    const t = this.targetMap.get(from);
    this.targetMap.delete(from);
    if (t) this.targetMap.set(to, t);
    if (this.activeId === from) this.activeId = null;
    this.paintHighlights();
  }

  removeTarget(id: string) {
    this.targetMap.delete(id);
    if (this.activeId === id) this.activeId = null;
    this.paintHighlights();
  }

  setActiveTarget(id: string | null) {
    this.activeId = id;
    this.paintHighlights();
  }

  private paintHighlights() {
    const registry = (typeof CSS !== 'undefined' ? (CSS as unknown as { highlights?: HighlightRegistry }).highlights : undefined) ?? null;
    const Ctor = (window as unknown as { Highlight?: HighlightCtor }).Highlight;
    if (!registry || !Ctor) return;
    registry.delete('proposal-target');
    registry.delete('passage-attached');
    if (!this.activeId) return;
    const t = this.targetMap.get(this.activeId);
    if (!t || t.range.collapsed) return;
    registry.set(this.activeId === PENDING ? 'passage-attached' : 'proposal-target', new Ctor(t.range));
  }
}

