import React, { useEffect, useState } from 'react'
import { ArrowLeftIcon, BookPlusIcon, InfoIcon, LogInIcon, PlusIcon, XIcon } from 'lucide-react'
import { Button } from '../Button'
import { IconButton } from '../IconButton'
import { Input } from '../Input'
import { Skeleton } from '../Skeleton'
import { ContextPreview } from './ContextPreview'
import { DictionaryChoiceList } from './DictionaryChoiceList'
import { languageName } from '../../utils/languages'
import type { CollectController } from '../../hooks/useCollect'

interface CollectPanelProps {
  collect: CollectController
  showHeader: boolean
}

const FIELD_NAMES = { definition: 'definitions', example: 'examples' }

export function CollectPanel({ collect, showHeader }: CollectPanelProps) {
  const { step, selection, direction, compatible, duplicate } = collect
  const [chosen, setChosen] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    if (step === 'pick' && chosen && !compatible.some((d) => d.id === chosen)) setChosen(null)
    if (step === 'new') {
      setName('')
      setNameError('')
    }
  }, [step, compatible, chosen])

  if (!selection) return null
  const [from, to] = direction
  const chosenDict = compatible.find((d) => d.id === chosen)
  const busy = chosen ? collect.isInflight(chosen) : false

  const createAndAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setNameError('Enter a name for the new dictionary.')
      return
    }
    collect.submit({ newName: name.trim() })
  }

  return (
    <div className="flex flex-col">
      {showHeader && (
        <div className="flex items-start justify-between gap-2 border-b border-border-default px-4 py-3">
          <h2 className="min-w-0 break-words text-sm font-semibold text-text-primary">
            {step === 'new' ? 'New dictionary' : step === 'signin' ? 'Sign in to add words' : `Add “${selection.text}”`}
          </h2>
          <IconButton icon={<XIcon />} label="Close" variant="ghost" size="sm" onClick={collect.close} showTooltip={false} />
        </div>
      )}

      <div className="space-y-4 p-4">
        {step !== 'signin' && <ContextPreview selection={selection} from={from} to={to} />}

        {step === 'loading' && (
          <div className="space-y-2" aria-label="Loading dictionaries">
            <Skeleton variant="rect" height={44} />
            <Skeleton variant="rect" height={44} />
          </div>
        )}

        {step === 'signin' && (
          <div className="space-y-3">
            <p className="text-sm leading-6 text-text-secondary">
              Save “<span className="font-medium text-text-primary">{selection.text}</span>” with its contextual meaning to one of
              your dictionaries. Your selection is kept — you’ll come right back here.
            </p>
            <Button fullWidth loading={collect.signingIn} onClick={collect.signIn} leadingIcon={<LogInIcon className="h-4 w-4" />}>
              Sign in and continue
            </Button>
            <Button fullWidth variant="ghost" onClick={collect.close} disabled={collect.signingIn}>
              Keep reading
            </Button>
          </div>
        )}

        {step === 'pick' && (
          <>
            {compatible.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-text-primary">Choose a dictionary</p>
                <DictionaryChoiceList dictionaries={compatible} value={chosen} onChange={setChosen} isBusy={collect.isInflight} />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border-strong p-4 text-sm leading-6 text-text-secondary">
                <p className="font-medium text-text-primary">
                  No {languageName(from)} → {languageName(to)} dictionaries yet
                </p>
                <p className="mt-1">Create one for this direction. Your other dictionaries keep their languages.</p>
              </div>
            )}
            <Button variant="ghost" size="compact" onClick={collect.goNew} leadingIcon={<PlusIcon className="h-4 w-4" />}>
              Create new dictionary
            </Button>
            {chosenDict && chosenDict.hiddenFields.length > 0 && (
              <p className="flex gap-2 rounded-xl bg-background-subtle p-3 text-xs leading-5 text-text-secondary">
                <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
                <span>
                  This dictionary hides {chosenDict.hiddenFields.map((f) => FIELD_NAMES[f]).join(' and ')}. This card still
                  includes every field; your dictionary’s display settings stay the same.
                </span>
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 border-t border-border-default pt-4 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={collect.close}>
                Cancel
              </Button>
              <Button
                disabled={!chosen || busy}
                onClick={() => chosen && collect.submit({ dictionaryId: chosen })}
                leadingIcon={<BookPlusIcon className="h-4 w-4" />}
              >
                {busy ? 'Already adding…' : 'Add card'}
              </Button>
            </div>
            {!chosen && compatible.length > 0 && <p className="text-xs text-text-tertiary">Choose a dictionary to enable Add card.</p>}
          </>
        )}

        {step === 'new' && (
          <form onSubmit={createAndAdd} className="space-y-4" noValidate>
            <Input
              label="Dictionary name"
              required
              autoFocus
              maxLength={80}
              placeholder={`e.g. ${languageName(from)} reading`}
              value={name}
              error={nameError}
              onChange={(e) => {
                setName(e.target.value)
                if (nameError) setNameError('')
              }}
            />
            <p className="text-xs leading-5 text-text-secondary">
              Languages: <span className="font-medium text-text-primary">{languageName(from)} → {languageName(to)}</span>, set by
              where you selected the word. The dictionary is created only if the card is added successfully.
            </p>
            <div className="flex flex-col-reverse gap-2 border-t border-border-default pt-4 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={collect.backToPick} leadingIcon={<ArrowLeftIcon className="h-4 w-4" />}>
                Back
              </Button>
              <Button type="submit" leadingIcon={<BookPlusIcon className="h-4 w-4" />}>
                Create and add
              </Button>
            </div>
          </form>
        )}

        {step === 'duplicate' && duplicate && (
          <div className="space-y-4">
            <div className="rounded-xl border border-warning-200 bg-warning-subtle p-3 text-sm leading-6">
              <p className="font-medium text-text-primary">
                “{duplicate.card.term}” is already in {compatible.find((d) => d.id === duplicate.dictionaryId)?.name}
              </p>
              <p className="text-text-secondary">
                Existing card: {duplicate.card.term} → {duplicate.card.translation}
              </p>
            </div>
            <p className="text-sm leading-6 text-text-secondary">
              Add another card only if you want a separate one for this meaning or context.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="secondary" onClick={collect.backToPick}>
                Choose another
              </Button>
              <Button onClick={() => collect.submit({ dictionaryId: duplicate.dictionaryId }, true)}>Add another card</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
