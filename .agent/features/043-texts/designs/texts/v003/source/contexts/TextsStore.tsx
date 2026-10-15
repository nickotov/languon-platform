import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { seedCards, seedDictionaries } from '../data/dictionaries'
import { seedFolders } from '../data/folders'
import { sharedFolderFixtures } from '../data/sharedFixtures'
import { seedTexts } from '../data/texts'
import type { Card, Dictionary, Folder, ShareResolution, TextDoc } from '../types/texts'

type CardInput = Omit<Card, 'id' | 'dictionaryId' | 'createdAt'>

interface TextsStore {
  folders: Folder[]
  texts: TextDoc[]
  dictionaries: Dictionary[]
  cards: Card[]
  createFolder: (input: { name: string; description: string }) => Folder
  updateFolder: (id: string, patch: { name: string; description: string }) => void
  setFolderArchived: (id: string, archived: boolean) => void
  saveText: (doc: TextDoc) => TextDoc
  updateTextTitle: (id: string, title: string) => void
  setTextArchived: (id: string, archived: boolean) => void
  createShareLink: (kind: 'text' | 'folder', id: string) => string
  revokeShareLink: (kind: 'text' | 'folder', id: string) => void
  addCard: (dictionaryId: string, card: CardInput) => Card
  createDictionaryWithCard: (dict: Omit<Dictionary, 'id'>, card: CardInput) => { dictionary: Dictionary; card: Card }
  copyTexts: (source: TextDoc[], dest: { folderId?: string; newFolderName?: string }) => Folder
  resolveShare: (token: string) => ShareResolution
}

const StoreContext = createContext<TextsStore | null>(null)

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`
const now = () => new Date().toISOString()

export function TextsStoreProvider({ children }: { children: React.ReactNode }) {
  const [folders, setFolders] = useState<Folder[]>(seedFolders)
  const [texts, setTexts] = useState<TextDoc[]>(seedTexts)
  const [dictionaries, setDictionaries] = useState<Dictionary[]>(seedDictionaries)
  const [cards, setCards] = useState<Card[]>(seedCards)

  const touchFolder = useCallback((id: string) => {
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, updatedAt: now() } : f)))
  }, [])

  const createFolder = useCallback((input: { name: string; description: string }) => {
    const folder: Folder = {
      id: uid('f'), name: input.name, description: input.description, archived: false, updatedAt: now(), shareToken: null,
    }
    setFolders((prev) => [folder, ...prev])
    return folder
  }, [])

  const updateFolder = useCallback((id: string, patch: { name: string; description: string }) => {
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch, updatedAt: now() } : f)))
  }, [])

  const setFolderArchived = useCallback((id: string, archived: boolean) => {
    // Archiving disables links; restoring keeps the folder private until shared again.
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, archived, shareToken: null, updatedAt: now() } : f)))
  }, [])

  const saveText = useCallback(
    (doc: TextDoc) => {
      const saved = { ...doc, updatedAt: now() }
      setTexts((prev) => (prev.some((t) => t.id === doc.id) ? prev.map((t) => (t.id === doc.id ? saved : t)) : [saved, ...prev]))
      touchFolder(doc.folderId)
      return saved
    },
    [touchFolder],
  )

  const updateTextTitle = useCallback((id: string, title: string) => {
    // Title-only edits never change translation provenance.
    setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, title, updatedAt: now() } : t)))
  }, [])

  const setTextArchived = useCallback((id: string, archived: boolean) => {
    setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, archived, shareToken: null, updatedAt: now() } : t)))
  }, [])

  const createShareLink = useCallback((kind: 'text' | 'folder', id: string) => {
    const token = `${kind === 'text' ? 't' : 'f'}${Math.random().toString(36).slice(2, 10)}`
    if (kind === 'text') setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, shareToken: token } : t)))
    else setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, shareToken: token } : f)))
    return token
  }, [])

  const revokeShareLink = useCallback((kind: 'text' | 'folder', id: string) => {
    if (kind === 'text') setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, shareToken: null } : t)))
    else setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, shareToken: null } : f)))
  }, [])

  const addCard = useCallback((dictionaryId: string, input: CardInput) => {
    const card: Card = { ...input, id: uid('c'), dictionaryId, createdAt: now() }
    setCards((prev) => [card, ...prev])
    return card
  }, [])

  const createDictionaryWithCard = useCallback((dict: Omit<Dictionary, 'id'>, input: CardInput) => {
    const dictionary: Dictionary = { ...dict, id: uid('d') }
    const card: Card = { ...input, id: uid('c'), dictionaryId: dictionary.id, createdAt: now() }
    setDictionaries((prev) => [...prev, dictionary])
    setCards((prev) => [card, ...prev])
    return { dictionary, card }
  }, [])

  const copyTexts = useCallback(
    (source: TextDoc[], dest: { folderId?: string; newFolderName?: string }) => {
      let folder = folders.find((f) => f.id === dest.folderId)
      if (!folder) {
        folder = { id: uid('f'), name: dest.newFolderName || 'Copied texts', description: '', archived: false, updatedAt: now(), shareToken: null }
        const created = folder
        setFolders((prev) => [created, ...prev])
      }
      const target = folder
      const copies = source.map((t) => ({
        ...t,
        id: uid('t'),
        folderId: target.id,
        pairs: t.pairs.map((p) => ({ ...p, id: uid('p') })),
        shareToken: null,
        archived: false,
        version: 1,
        updatedAt: now(),
      }))
      setTexts((prev) => [...copies, ...prev])
      touchFolder(target.id)
      return target
    },
    [folders, touchFolder],
  )

  const resolveShare = useCallback(
    (token: string): ShareResolution => {
      const fixture = sharedFolderFixtures.find((f) => f.token === token)
      if (fixture) return { kind: 'folder', folder: fixture.folder, texts: fixture.texts, totalTranslated: fixture.totalTranslated, external: true }
      const folder = folders.find((f) => f.shareToken === token && !f.archived)
      if (folder) {
        const visible = texts.filter((t) => t.folderId === folder.id && !t.archived && t.status !== 'draft')
        return { kind: 'folder', folder, texts: visible, totalTranslated: visible.length, external: false }
      }
      const text = texts.find((t) => t.shareToken === token && !t.archived && t.status !== 'draft')
      const parent = text && folders.find((f) => f.id === text.folderId)
      if (text && parent && !parent.archived) return { kind: 'text', text, external: false }
      return { kind: 'unavailable' }
    },
    [folders, texts],
  )

  const value = useMemo(
    () => ({
      folders, texts, dictionaries, cards, createFolder, updateFolder, setFolderArchived, saveText, updateTextTitle,
      setTextArchived, createShareLink, revokeShareLink, addCard, createDictionaryWithCard, copyTexts, resolveShare,
    }),
    [folders, texts, dictionaries, cards, createFolder, updateFolder, setFolderArchived, saveText, updateTextTitle,
      setTextArchived, createShareLink, revokeShareLink, addCard, createDictionaryWithCard, copyTexts, resolveShare],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useTextsStore(): TextsStore {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useTextsStore must be used inside TextsStoreProvider')
  return ctx
}
