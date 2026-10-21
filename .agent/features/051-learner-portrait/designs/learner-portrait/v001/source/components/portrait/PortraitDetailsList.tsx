import React from 'react';
import { AGE_RANGES, GOALS, LENGTHS, LEVELS, MIXING, NEEDS, ORDERS, TONES, WORDINGS, labelOf } from '../../data/portraitOptions';
import type { PortraitItems } from '../../types/portrait';

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-text-secondary">{term}</dt>
      <dd className="break-words text-sm text-text-primary sm:col-span-2">{children}</dd>
    </div>
  );
}

const none = <span className="text-text-tertiary">Not set</span>;

export function PortraitDetailsList({ items }: { items: PortraitItems }) {
  const goals = [...items.goals.map((g) => labelOf(GOALS, g)), ...items.customGoals];
  const needs = [...items.needs.map((n) => labelOf(NEEDS, n)), ...items.customNeeds];
  return (
    <dl className="divide-y divide-border-default">
      <Row term="Languages">
        {items.languages.length ? (
          <ul className="space-y-1">
            {items.languages.map((l) => (
              <li key={l.id}>
                <span className="font-medium">{l.name}</span>
                {l.level && ` · ${labelOf(LEVELS, l.level)}`}
                {l.learning && ' · Learning'}
                {l.note && <span className="block text-text-secondary">“{l.note}”</span>}
              </li>
            ))}
          </ul>
        ) : (
          none
        )}
      </Row>
      <Row term="Explanation languages">
        {items.explanationLanguages.length || items.mixing ? (
          <>
            {items.explanationLanguages.join(', ') || 'No preference'}
            {items.mixing && ` · ${labelOf(MIXING, items.mixing)}`}
            {items.mixingNote && <span className="block text-text-secondary">“{items.mixingNote}”</span>}
          </>
        ) : (
          none
        )}
      </Row>
      <Row term="Goals">{goals.length ? goals.join(', ') : none}</Row>
      <Row term="Tone and style">
        {[labelOf(TONES, items.tone), labelOf(LENGTHS, items.length), labelOf(WORDINGS, items.wording), labelOf(ORDERS, items.order)].filter(Boolean).join(' · ') || none}
      </Row>
      <Row term="Learning needs">{needs.length ? needs.join(', ') : none}</Row>
      <Row term="Interests">{items.interests.length ? items.interests.join(', ') : none}</Row>
      <Row term="Age range">{items.ageRange ? labelOf(AGE_RANGES, items.ageRange) : none}</Row>
      {items.notes.length > 0 && (
        <Row term="Notes">
          <ul className="space-y-1">
            {items.notes.map((n) => (
              <li key={n.id}>“{n.text}”</li>
            ))}
          </ul>
        </Row>
      )}
    </dl>
  );
}

