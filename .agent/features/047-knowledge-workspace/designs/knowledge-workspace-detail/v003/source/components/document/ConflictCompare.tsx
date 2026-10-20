import React, { useMemo, useState } from 'react';
import { LaptopIcon, MergeIcon, SmartphoneIcon, CopyPlusIcon } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import type { ConflictVersion } from '../../types/document';
import { Button } from '../Button';
import { InlineAlert } from '../InlineAlert';
import { compareBlocks, htmlBlocks } from '../../utils/docCompare';
import type { ComparedBlock } from '../../utils/docCompare';

interface ConflictCompareProps {
  thisTitle: string;
  thisHtml: string;
  other: ConflictVersion;
  stacked: boolean;
  touch: boolean;
  onContinueThis: () => void;
  onContinueOther: () => void;
  onCombine: () => void;
  onSaveOtherAsNote: () => void;
}

export function ConflictCompare(p: ConflictCompareProps) {
  const [onlyChanges, setOnlyChanges] = useState(true);
  const { left, right } = useMemo(() => compareBlocks(htmlBlocks(p.thisHtml), htmlBlocks(p.other.html)), [p.thisHtml, p.other.html]);
  const changedCount = left.filter((b) => b.changed).length + right.filter((b) => b.changed).length;
  const size = p.touch ? 'default' : 'compact';

  const column = (label: string, icon: React.ReactNode, meta: string, blocks: ComparedBlock[]) => (
    <section aria-label={label} className="min-w-0 flex-1 rounded-2xl border border-border-default bg-background-surface">
      <header className="flex items-center gap-2 border-b border-border-default px-4 py-2.5">
        <span className="text-text-tertiary">{icon}</span>
        <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
        <span className="ml-auto text-xs text-text-tertiary">{meta}</span>
      </header>
      <div className="doc-prose doc-prose-compact max-h-96 overflow-y-auto px-4 py-3">
        {blocks.map((b, i) =>
          onlyChanges && !b.changed ? (
            i > 0 && !blocks[i - 1].changed ? null : (
              <p key={i} className="!my-1 text-xs text-text-tertiary" aria-hidden="true">
                ⋯ unchanged
              </p>
            )
          ) : (
            <div key={i} className={b.changed ? 'relative -mx-2 rounded-lg bg-warning-subtle px-2 py-0.5' : ''}>
              {b.changed && <span className="sr-only">Different: </span>}
              <div dangerouslySetInnerHTML={{ __html: b.block.html }} />
            </div>
          ),
        )}
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      <InlineAlert tone="warning" title="This draft was also edited on another device">
        Your {p.other.device.toLowerCase()} changed it {formatDistanceToNowStrict(p.other.at, { addSuffix: true })} while this tab had unsaved edits. Both
        versions are kept — nothing has been overwritten. Choose how to continue.
      </InlineAlert>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-text-secondary">
          {changedCount} {changedCount === 1 ? 'section differs' : 'sections differ'} · highlighted
        </p>
        <label className={`flex cursor-pointer items-center gap-2 text-sm text-text-primary ${p.touch ? 'min-h-11' : ''}`}>
          <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} className="h-4 w-4 accent-primary-default" />
          Only differences
        </label>
      </div>
      <div className={`flex gap-3 ${p.stacked ? 'flex-col' : ''}`}>
        {column('This tab', <LaptopIcon className="h-4 w-4" aria-hidden="true" />, 'Your current edits', left)}
        {column(p.other.device, <SmartphoneIcon className="h-4 w-4" aria-hidden="true" />, formatDistanceToNowStrict(p.other.at, { addSuffix: true }), right)}
      </div>
      <div className="flex flex-wrap gap-2 rounded-2xl border border-border-default bg-background-surface p-3">
        <Button size={size} onClick={p.onContinueThis} leadingIcon={<LaptopIcon className="h-4 w-4" />}>
          Continue with this tab
        </Button>
        <Button size={size} variant="secondary" onClick={p.onContinueOther} leadingIcon={<SmartphoneIcon className="h-4 w-4" />}>
          Continue with {p.other.device.toLowerCase()} version
        </Button>
        <Button size={size} variant="secondary" onClick={p.onCombine} leadingIcon={<MergeIcon className="h-4 w-4" />}>
          Combine manually
        </Button>
        <Button size={size} variant="ghost" onClick={p.onSaveOtherAsNote} leadingIcon={<CopyPlusIcon className="h-4 w-4" />}>
          Save {p.other.device.toLowerCase()} version as a separate note
        </Button>
        <p className="w-full text-xs text-text-tertiary">The version you don’t continue with is kept in Revision history.</p>
      </div>
    </div>
  );
}

