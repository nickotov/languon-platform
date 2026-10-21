import React from 'react'
import { useParams } from 'react-router-dom'
import { DocumentLayout } from '../components/DocumentLayout'
import { Badge } from '../components/Badge'
import { useResources } from '../contexts/ResourcesContext'
import { navSections } from '../data/navigation'
import { textSample } from '../data/resources'
import { NotFound } from './NotFound'

export function TextReader() {
  const { id } = useParams()
  const { items } = useResources()
  const text = items.find((r) => r.kind === 'text' && r.id === id)
  const section = navSections.find((s) => s.id === 'texts')
  if (!text || !section) return <NotFound />

  return (
    <DocumentLayout section={section} title={text.title}>
      <article>
        {text.folder && <Badge size="sm">{text.folder}</Badge>}
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary">{text.title}</h1>
        <div className="mt-8 space-y-5 text-lg leading-relaxed text-text-primary">
          {textSample.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </article>
    </DocumentLayout>
  )
}

