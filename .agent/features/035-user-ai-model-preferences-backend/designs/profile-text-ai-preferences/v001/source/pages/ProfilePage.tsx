import React, { useEffect, useState } from 'react'
import {
  CoinsIcon,
  CreditCardIcon,
  MoonIcon,
  ShieldCheckIcon,
  SunIcon,
  UserIcon,
} from 'lucide-react'
import { IconButton } from '../components/IconButton'
import { Tabs } from '../components/Tabs'
import { AccountTab } from '../components/profile/AccountTab'
import { SecurityTab } from '../components/profile/SecurityTab'
import { BillingTab } from '../components/profile/BillingTab'
import { CreditsTab } from '../components/profile/CreditsTab'
import { ProfileHeader } from '../components/profile/ProfileHeader'
import {
  ProfileErrorState,
  ProfileSkeleton,
} from '../components/profile/ProfileStates'
import { ToastStack } from '../components/profile/ToastStack'
import { LeaveConfirmDialog } from '../components/modelPreference/LeaveConfirmDialog'
import { SessionExpiredScreen } from '../components/modelPreference/SessionExpiredScreen'
import { useAccountData, type LoadState } from '../hooks/useAccountData'
import { useModelPreference } from '../hooks/useModelPreference'
import { useToastQueue } from '../hooks/useToastQueue'
import { choiceLabel } from '../utils/modelPreference'
import type { PlanId } from '../types/account'
import type { ModelScenario, SaveOutcome } from '../types/modelPreference'

type TabValue = 'account' | 'security' | 'billing' | 'credits'

const TAB_ITEMS = [
  {
    value: 'account',
    label: 'Account',
    icon: <UserIcon aria-hidden="true" className="h-4 w-4" />,
  },
  {
    value: 'security',
    label: 'Security',
    icon: <ShieldCheckIcon aria-hidden="true" className="h-4 w-4" />,
  },
  {
    value: 'billing',
    label: 'Billing',
    icon: <CreditCardIcon aria-hidden="true" className="h-4 w-4" />,
  },
  {
    value: 'credits',
    label: 'AI credits',
    icon: <CoinsIcon aria-hidden="true" className="h-4 w-4" />,
  },
]

interface ProfilePageProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  loadState: LoadState
  planId: PlanId
  failWrites: boolean
  modelScenario: ModelScenario
  nextSaveOutcome: SaveOutcome
}

export function ProfilePage({
  theme,
  onToggleTheme,
  loadState,
  planId,
  failWrites,
  modelScenario,
  nextSaveOutcome,
}: ProfilePageProps) {
  const [tab, setTab] = useState<TabValue>('account')
  const [pendingTab, setPendingTab] = useState<TabValue | null>(null)
  const [sessionExpired, setSessionExpired] = useState(
    modelScenario === 'session-expired',
  )
  const { status, data, error, reload, update } = useAccountData({
    initialLoadState: loadState,
    planId,
    zeroCredits: modelScenario === 'zero-credits',
  })
  const modelPreference = useModelPreference({
    scenario: modelScenario,
    nextSaveOutcome,
  })
  const { toasts, push, dismiss } = useToastQueue()
  const taskInProgress = modelScenario === 'task-in-progress'

  // Re-apply page-level states when the reviewed scenario changes.
  useEffect(() => {
    setTab('account')
    setSessionExpired(modelScenario === 'session-expired')
    setPendingTab(modelScenario === 'unsaved-navigation' ? 'security' : null)
  }, [modelScenario])

  // Ask the browser to confirm leaving the page with an unsaved choice.
  useEffect(() => {
    if (!modelPreference.dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [modelPreference.dirty])

  function requestTab(next: TabValue) {
    if (next === tab) return
    if (tab === 'account' && modelPreference.dirty) {
      setPendingTab(next)
      return
    }
    setTab(next)
  }

  function goToPaywall() {
    push({
      title: 'Opening plan comparison',
      description: 'The paywall with full plan details comes next.',
      variant: 'info',
    })
  }

  const prefState = modelPreference.state

  return (
    <div className="min-h-screen w-full bg-background-canvas text-text-primary">
      <header className="sticky top-0 z-40 border-b border-border-default bg-background-surface">
        <div className="mx-auto flex h-topbar max-w-app items-center justify-between gap-4 px-4 sm:px-6 lg:px-12">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="radius-sm flex h-8 w-8 items-center justify-center bg-primary-default text-sm font-semibold text-background-surface"
            >
              L
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Languon
            </span>
          </div>
          <IconButton
            icon={
              theme === 'light' ? (
                <MoonIcon aria-hidden="true" className="h-5 w-5" />
              ) : (
                <SunIcon aria-hidden="true" className="h-5 w-5" />
              )
            }
            label={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
            variant="ghost"
            onClick={onToggleTheme}
          />
        </div>
      </header>

      <main className="mx-auto max-w-app px-4 py-8 sm:px-6 sm:py-10 lg:px-12">
        {sessionExpired ? (
          <SessionExpiredScreen onSignIn={() => setSessionExpired(false)} />
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Account settings
              </h1>
              <p className="mt-1 max-w-reading text-sm leading-relaxed text-text-secondary">
                Manage how you sign in, your subscription, and the credits that
                power lessons, reviews, and your AI tutor.
              </p>
            </div>

            {status === 'success' && data ? (
              <div className="mb-6">
                <ProfileHeader data={data} onUpgrade={goToPaywall} />
              </div>
            ) : null}

            <Tabs
              items={TAB_ITEMS}
              value={tab}
              onValueChange={(value) => requestTab(value as TabValue)}
              variant="underline"
              aria-label="Account sections"
              className="mb-6"
            >
              {(active) => {
                if (status === 'loading') return <ProfileSkeleton />
                if (status === 'error' || !data)
                  return (
                    <ProfileErrorState
                      message={
                        error ??
                        'We could not load your account. Please try again.'
                      }
                      onRetry={reload}
                    />
                  )

                if (active === 'security')
                  return (
                    <SecurityTab
                      data={data}
                      update={update}
                      pushToast={push}
                      failWrites={failWrites}
                    />
                  )
                if (active === 'billing')
                  return (
                    <BillingTab
                      data={data}
                      update={update}
                      pushToast={push}
                      onUpgrade={goToPaywall}
                      failWrites={failWrites}
                    />
                  )
                if (active === 'credits')
                  return (
                    <CreditsTab
                      data={data}
                      onBuyCredits={() => setTab('billing')}
                    />
                  )
                return (
                  <AccountTab
                    data={data}
                    update={update}
                    pushToast={push}
                    failWrites={failWrites}
                    modelPreference={modelPreference}
                    taskInProgress={taskInProgress}
                    onOpenCredits={() => requestTab('credits')}
                  />
                )
              }}
            </Tabs>
          </>
        )}
      </main>

      <LeaveConfirmDialog
        open={pendingTab !== null && !sessionExpired}
        savedLabel={
          prefState.saved ? choiceLabel(prefState, prefState.saved.choice) : ''
        }
        draftLabel={prefState.draft ? choiceLabel(prefState, prefState.draft) : ''}
        onKeepEditing={() => setPendingTab(null)}
        onDiscard={() => {
          modelPreference.cancel()
          if (pendingTab) setTab(pendingTab)
          setPendingTab(null)
        }}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

