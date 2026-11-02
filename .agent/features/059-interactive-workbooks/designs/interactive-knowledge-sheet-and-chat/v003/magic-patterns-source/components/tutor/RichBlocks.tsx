import React from 'react';
import type { Block } from '../../types/tutor';
import { blockPlain, inlinePlain, parseInline, truncateSegments } from '../../utils/richText';

interface RichBlocksProps {
  blocks: Block[];
  /** Number of plain characters to show. Omit to show everything. */
  revealed?: number;
}

export function RichBlocks({ blocks, revealed }: RichBlocksProps) {
  const nodes: React.ReactNode[] = [];
  let offset = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const start = offset;
    offset += blockPlain(block).length;
    if (revealed !== undefined && revealed <= start) break;
    const avail = revealed === undefined ? Infinity : revealed - start;
    nodes.push(<BlockView key={i} block={block} avail={avail} />);
  }
  return <div className="space-y-3">{nodes}</div>;
}

function Inline({ text, avail = Infinity }: { text: string; avail?: number }) {
  const segments = truncateSegments(parseInline(text), avail);
  return (
    <>
      {segments.map((s, i) => {
        if (s.bold) return <strong key={i} className="font-semibold text-text-primary">{s.text}</strong>;
        if (s.em) return <em key={i}>{s.text}</em>;
        return <React.Fragment key={i}>{s.text}</React.Fragment>;
      })}
    </>
  );
}

function BlockView({ block, avail }: { block: Block; avail: number }) {
  switch (block.type) {
    case 'h':
      return (
        <h4 className="pt-1 text-sm font-semibold tracking-tight text-text-primary">
          <Inline text={block.text} avail={avail} />
        </h4>
      );
    case 'p':
      return (
        <p>
          <Inline text={block.text} avail={avail} />
        </p>
      );
    case 'ul':
    case 'ol': {
      const Tag = block.type === 'ul' ? 'ul' : 'ol';
      let left = avail;
      const items: React.ReactNode[] = [];
      for (let i = 0; i < block.items.length && left > 0; i++) {
        const len = inlinePlain(block.items[i]).length;
        items.push(
          <li key={i} className="pl-1">
            <Inline text={block.items[i]} avail={left} />
          </li>,
        );
        left -= len;
      }
      return (
        <Tag className={`space-y-1.5 pl-5 ${block.type === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-text-tertiary`}>
          {items}
        </Tag>
      );
    }
    case 'example': {
      const sourceLen = inlinePlain(block.source).length;
      const showTranslation = block.translation && avail > sourceLen;
      return (
        <figure className="rounded-xl border-l-2 border-primary-default bg-background-subtle px-3.5 py-2.5">
          <p lang={block.lang ?? 'fr'} dir={block.dir} className="font-medium text-text-primary">
            <Inline text={block.source} avail={avail} />
          </p>
          {showTranslation && (
            <figcaption className="mt-1 flex gap-1.5 text-sm leading-6 text-text-secondary">
              <span aria-hidden="true" className="select-none text-text-tertiary">
                ↳
              </span>
              <span>
                <span className="sr-only">Translation: </span>
                <Inline text={block.translation as string} avail={avail - sourceLen} />
              </span>
            </figcaption>
          )}
        </figure>
      );
    }
    case 'table': {
      const headLen = block.head.map(inlinePlain).join('').length;
      let consumed = headLen;
      const rows: string[][] = [];
      for (const row of block.rows) {
        if (avail <= consumed) break;
        rows.push(row);
        consumed += row.map(inlinePlain).join('').length;
      }
      const wide = block.head.length > 3;
      return (
        <div
          role="region"
          aria-label="Comparison table"
          tabIndex={0}
          className="overflow-x-auto rounded-xl border border-border-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <table className="min-w-full border-collapse text-left text-sm leading-6">
            <thead className="bg-background-subtle">
              <tr>
                {block.head.map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    className={`px-3 py-2 font-semibold text-text-primary ${wide ? 'whitespace-nowrap' : ''}`}
                  >
                    <Inline text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className="border-t border-border-default">
                  {row.map((cell, c) =>
                    c === 0 ? (
                      <th key={c} scope="row" className={`px-3 py-2 align-top font-medium text-text-secondary ${wide ? 'whitespace-nowrap' : ''}`}>
                        <Inline text={cell} />
                      </th>
                    ) : (
                      <td key={c} lang="fr" className={`px-3 py-2 align-top text-text-primary ${wide ? 'whitespace-nowrap' : ''}`}>
                        <Inline text={cell} />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }
}

