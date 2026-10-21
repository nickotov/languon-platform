import React from 'react'
import { PageHeader } from '../components/PageHeader'
import { Avatar } from '../components/Avatar'
import { LanguageControl, ThemeControl } from '../components/nav/PreferenceControls'
import { usePreferences } from '../contexts/PreferencesContext'

export function Settings() {
  const { t } = usePreferences()

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8 md:py-12">
        <PageHeader title={t('page.settings')} />

        <section id="profile" aria-labelledby="profile-heading" className="mt-10 rounded-xl border border-border-default bg-background-surface p-5">
          <h2 id="profile-heading" className="text-sm font-semibold text-text-primary">{t('account.profile')}</h2>
          <div className="mt-4 flex items-center gap-4">
            <Avatar name="Anna Volkova" size="lg" />
            <div>
              <p className="text-sm font-medium text-text-primary">Anna Volkova</p>
              <p className="text-sm text-text-tertiary">anna.volkova@gmail.com</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="prefs-heading" className="mt-6 rounded-xl border border-border-default bg-background-surface p-5">
          <h2 id="prefs-heading" className="text-sm font-semibold text-text-primary">{t('page.preferences')}</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-text-tertiary">{t('account.theme')}</p>
              <ThemeControl />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-text-tertiary">{t('account.language')}</p>
              <LanguageControl />
            </div>
          </div>
        </section>

        <section id="ai" aria-labelledby="ai-heading" className="mt-6 rounded-xl border border-border-default bg-background-surface p-5">
          <h2 id="ai-heading" className="text-sm font-semibold text-text-primary">{t('account.ai')}</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Provider and model selection keeps using the existing settings form — the navigation only links here.
          </p>
        </section>
      </div>
    </div>
  )
}

