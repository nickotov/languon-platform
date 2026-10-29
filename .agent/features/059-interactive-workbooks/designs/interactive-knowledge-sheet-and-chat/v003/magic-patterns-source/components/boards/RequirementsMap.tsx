import React from 'react';
import type { MapStatus } from '../../data/requirementsMap';
import { requirementsMap } from '../../data/requirementsMap';
import { BoardShell } from './BoardShell';

const statusStyle: Record<MapStatus, string> = {
  Built: 'bg-success-subtle text-success-default',
  Partial: 'bg-warning-subtle text-warning-default',
  Board: 'bg-primary-subtle text-primary-default',
  Concept: 'border border-dashed border-border-strong text-text-tertiary',
};

/** Map from the brief's requirements to frames and components. */
export function RequirementsMap({ mobile }: { mobile: boolean }) {
  return (
    <BoardShell mobile={mobile} title="Requirements map · KS-01 – KS-23" subtitle="Where each requirement can be inspected, and what is intentionally partial or conceptual.">
      <div className="overflow-x-auto rounded-2xl border border-border-default bg-background-surface">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border-default text-xs text-text-tertiary">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">ID</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Requirement</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Where to look</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {requirementsMap.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-text-tertiary">{r.id}</td>
                <td className="px-4 py-3 font-medium text-text-primary">{r.topic}</td>
                <td className="px-4 py-3 text-text-secondary">
                  {r.where}
                  {r.note && <span className="mt-0.5 block text-xs text-text-tertiary">{r.note}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[r.status]}`}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BoardShell>
  );
}

