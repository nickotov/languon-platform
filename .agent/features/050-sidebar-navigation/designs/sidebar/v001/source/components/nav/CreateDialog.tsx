import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogActions } from '../Dialog'
import { Button } from '../Button'
import { usePreferences } from '../../contexts/PreferencesContext'
import { useResources } from '../../contexts/ResourcesContext'
import { navSections } from '../../data/navigation'
import { resourcePath } from '../../utils/navigation'
import type { ResourceKind } from '../../types/navigation'

const languagePairs = ['EN → RU', 'FR → RU', 'DE → RU', 'ES → RU', 'FR → EN']

export function CreateDialog({ kind, onClose }: { kind: ResourceKind | null; onClose: () => void }) {
  const { t } = usePreferences()
  const { addResource } = useResources()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [pair, setPair] = useState(languagePairs[0])
  const [error, setError] = useState(false)
  const config = navSections.find((s) => s.resources?.kind === kind)?.resources

  useEffect(() => {
    if (kind) {
      setName('')
      setError(false)
    }
  }, [kind])

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault()
    if (!kind) return
    if (!name.trim()) {
      setError(true)
      return
    }
    const resource = addResource(kind, name.trim(), kind === 'dictionary' ? pair : undefined)
    onClose()
    navigate(resourcePath(resource))
  }

  const fieldClass =
    'h-11 w-full rounded-xl border bg-background-surface px-3 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus'

  return (
    <Dialog
      open={Boolean(kind)}
      onClose={onClose}
      title={config ? t(config.createLabelKey) : ''}
      size="sm"
      footer={
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>{t('create.cancel')}</Button>
          <Button onClick={() => submit()}>{t('create.submit')}</Button>
        </DialogActions>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="create-name" className="text-sm font-medium text-text-primary">{t('create.nameLabel')}</label>
          <input
            id="create-name"
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setError(false)
            }}
            aria-invalid={error}
            className={`${fieldClass} ${error ? 'border-danger-default' : 'border-border-default'}`}
          />
          {error && <p className="text-xs text-danger-default">{t('create.nameLabel')} — required</p>}
        </div>
        {kind === 'dictionary' && (
          <div className="space-y-1">
            <label htmlFor="create-pair" className="text-sm font-medium text-text-primary">{t('create.pair')}</label>
            <select id="create-pair" value={pair} onChange={(event) => setPair(event.target.value)} className={`${fieldClass} border-border-default`}>
              {languagePairs.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        )}
      </form>
    </Dialog>
  )
}

