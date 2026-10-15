import React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/shell/AppShell'
import { DemoSettingsProvider } from './contexts/DemoSettings'
import { TextsStoreProvider } from './contexts/TextsStore'
import { ToastProvider } from './contexts/ToastContext'
import { DictionaryDetail } from './pages/DictionaryDetail'
import { FolderContents } from './pages/FolderContents'
import { PublicShare } from './pages/PublicShare'
import { TextsLibrary } from './pages/TextsLibrary'
import { TextWorkspace } from './pages/TextWorkspace'

type LibraryState = 'populated' | 'loading' | 'empty' | 'error'
type TranslateOutcome = 'success' | 'failure' | 'model-capacity' | 'no-credits' | 'ai-unavailable' | 'preview-expires'
type DetectOutcome = 'confident' | 'low-confidence' | 'failure'
type CollectOutcome =
  | 'success'
  | 'network-uncertain'
  | 'no-credits'
  | 'ai-unavailable'
  | 'dictionary-changed'
  | 'source-unavailable'
type SaveOutcome = 'success' | 'conflict' | 'failure'

interface AppProps {
  /** How the Texts library loads. */
  libraryState?: LibraryState
  /** Result of the first AI translation attempt (retries succeed). */
  translateOutcome?: TranslateOutcome
  /** Result of Detect language. */
  detectOutcome?: DetectOutcome
  /** Result of the first Add to dictionary attempt (retries succeed). */
  collectOutcome?: CollectOutcome
  /** Result of the first save of changes / copy (retries succeed). */
  saveOutcome?: SaveOutcome
  /** Whether visitors to shared links start signed in. */
  visitorSignedIn?: boolean
}

export function App({
  libraryState = 'populated',
  translateOutcome = 'success',
  detectOutcome = 'confident',
  collectOutcome = 'success',
  saveOutcome = 'success',
  visitorSignedIn = false,
}: AppProps) {
  return (
    <div data-theme="light" className="font-body min-h-screen w-full bg-background-canvas text-text-primary antialiased">
      <BrowserRouter>
        <DemoSettingsProvider
          value={{ libraryState, translateOutcome, detectOutcome, collectOutcome, saveOutcome, visitorSignedIn }}
        >
          <TextsStoreProvider>
            <ToastProvider>
              <Routes>
                <Route element={<AppShell />}>
                  <Route path="/texts" element={<TextsLibrary />} />
                  <Route path="/texts/folders/:folderId" element={<FolderContents />} />
                  <Route path="/dictionaries/:dictionaryId" element={<DictionaryDetail />} />
                </Route>
                <Route path="/texts/folders/:folderId/new" element={<TextWorkspace />} />
                <Route path="/texts/folders/:folderId/texts/:textId" element={<TextWorkspace />} />
                <Route path="/share/:token" element={<PublicShare />} />
                <Route path="/share/:token/texts/:textId" element={<PublicShare />} />
                <Route path="*" element={<Navigate to="/texts" replace />} />
              </Routes>
            </ToastProvider>
          </TextsStoreProvider>
        </DemoSettingsProvider>
      </BrowserRouter>
    </div>
  )
}
