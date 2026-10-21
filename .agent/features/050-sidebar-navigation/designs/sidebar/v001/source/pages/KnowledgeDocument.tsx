import React from 'react'
import { useParams } from 'react-router-dom'
import { CheckIcon } from 'lucide-react'
import { DocumentLayout } from '../components/DocumentLayout'
import { usePreferences } from '../contexts/PreferencesContext'
import { useResources } from '../contexts/ResourcesContext'
import { navSections } from '../data/navigation'
import { knowledgeSample } from '../data/resources'
import { NotFound } from './NotFound'

export function KnowledgeDocument() {
  const { id } = useParams()
  const { t } = usePreferences()
  const { items } = useResources()
  const doc = items.find((r) => r.kind === 'knowledge' && r.id === id)
  const section = navSections.find((s) => s.id === 'knowledge')
  if (!doc || !section) return <NotFound />

  return (
    <DocumentLayout
      section={section}
      title={doc.title}
      status={
        <span className="hidden items-center gap-1 text-xs text-text-tertiary sm:flex" role="status">
          <CheckIcon className="h-3.5 w-3.5 text-success-default" aria-hidden="true" />
          {t('page.saved')}
        </span>
      }
    >
      {/* Uncontrolled editable surface: sidebar expand/collapse never remounts it, so edits survive. */}
      <article key={doc.id} className="outline-none">
        <h1
          contentEditable
          suppressContentEditableWarning
          className="rounded-md text-3xl font-semibold tracking-tight text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          {doc.title}
        </h1>
        <div
          contentEditable
          suppressContentEditableWarning
          aria-label="Document body"
          className="mt-6 space-y-5 rounded-md text-base leading-relaxed text-text-primary outline-none"
        >
          <p>{knowledgeSample.intro}</p>
          {knowledgeSample.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-xl font-semibold text-text-primary">{s.heading}</h2>
              <p className="mt-2 text-text-secondary">{s.body}</p>
            </section>
          ))}
          <div className="rounded-xl border border-border-default bg-primary-subtle p-4">
            <p className="text-xs font-medium text-primary-default">AI suggestion</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-text-primary">
              <li>I ___ (never / be) to Lisbon.</li>
              <li>She ___ (move) to Berlin in 2021.</li>
              <li>We ___ (already / finish) the first module.</li>
            </ol>
          </div>
        </div>
      </article>
    </DocumentLayout>
  )
}

