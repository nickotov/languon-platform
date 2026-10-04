import React, { useState } from 'react'
import { DownloadIcon, Trash2Icon } from 'lucide-react'
import { Button } from '../Button'
import { InlineAlert } from '../InlineAlert'
import { SettingsSection } from './SettingsSection'
import { DataRow, RowList } from './DataRow'
import { ProfileDetailsSection } from './ProfileDetailsSection'
import { DeleteAccountDialog } from './DeleteAccountDialog'
import { ModelPreferenceSection } from '../modelPreference/ModelPreferenceSection'
import type { AccountData } from '../../types/account'
import type { ToastItem } from '../../hooks/useToastQueue'
import type { ModelPreferenceStore } from '../../hooks/useModelPreference'

interface AccountTabProps {
  data: AccountData
  update: (patch: (current: AccountData) => AccountData) => void
  pushToast: (toast: Omit<ToastItem, 'id'>) => void
  failWrites: boolean
  modelPreference: ModelPreferenceStore
  taskInProgress: boolean
  onOpenCredits: () => void
}

export function AccountTab({
  data,
  update,
  pushToast,
  failWrites,
  modelPreference,
  taskInProgress,
  onOpenCredits,
}: AccountTabProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [scheduled, setScheduled] = useState(false)

  const remainingCredits =
    Math.max(data.credits.includedTotal - data.credits.includedUsed, 0) +
    data.credits.extra

  return (
    <div className="space-y-6">
      <ProfileDetailsSection
        data={data}
        update={update}
        pushToast={pushToast}
        failWrites={failWrites}
      />

      <ModelPreferenceSection
        store={modelPreference}
        creditsAvailable={remainingCredits}
        taskInProgress={taskInProgress}
        onOpenCredits={onOpenCredits}
      />

      <SettingsSection
        id="data-export"
        title="Your data"
        description="Download everything you have created: lessons, vocabulary, mistakes, and progress."
      >
        <RowList>
          <DataRow
            icon={<DownloadIcon aria-hidden="true" className="h-4 w-4" />}
            title="Export account data"
            meta="We prepare a JSON archive and email you a download link."
            action={
              <Button
                variant="secondary"
                size="compact"
                onClick={() =>
                  pushToast({
                    title: 'Export requested',
                    description: `We will email ${data.profile.email} when your archive is ready.`,
                    variant: 'info',
                  })
                }
              >
                Request export
              </Button>
            }
          />
        </RowList>
      </SettingsSection>

      <SettingsSection
        id="danger-zone"
        title="Delete account"
        description="Permanently remove your account, your learning history, and any remaining credits."
        tone="danger"
      >
        <div className="space-y-4">
          {scheduled ? (
            <InlineAlert
              tone="info"
              title="Deletion scheduled"
              actions={
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={() => {
                    setScheduled(false)
                    pushToast({
                      title: 'Deletion cancelled',
                      description: 'Your account stays active.',
                      variant: 'success',
                    })
                  }}
                >
                  Cancel deletion
                </Button>
              }
            >
              Your account will be deleted in 14 days. You can cancel any time
              before then — after that, nothing can be recovered.
            </InlineAlert>
          ) : (
            <RowList>
              <DataRow
                icon={<Trash2Icon aria-hidden="true" className="h-4 w-4" />}
                title="Delete this account"
                meta="You will be asked to confirm by typing your username."
                action={
                  <Button
                    variant="danger"
                    size="compact"
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete account
                  </Button>
                }
              />
            </RowList>
          )}
        </div>
      </SettingsSection>

      <DeleteAccountDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        profile={data.profile}
        remainingCredits={remainingCredits}
        failWrites={failWrites}
        onDeleted={() => {
          setDeleteOpen(false)
          setScheduled(true)
          pushToast({
            title: 'Account scheduled for deletion',
            description: 'You have 14 days to change your mind.',
            variant: 'warning',
          })
        }}
      />
    </div>
  )
}

