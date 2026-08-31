'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  subscribeFolders,
  addFolder,
  updateFolder,
  reorderFolders,
  deleteFolder,
  shareFolder,
  unshareFolder,
  claimUnownedFolders,
  type Folder,
} from '@/lib/firestore'
import {
  colorThemes,
  DEFAULT_THEME,
  getSavedTheme,
  saveTheme,
  getSavedMode,
  saveMode,
  type ColorTheme,
  type ColorMode,
} from '@/lib/themes'
import { signOut } from '@/lib/auth'
import { useAuth } from './auth-provider'

export default function FoldersPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [folders, setFolders] = useState<Folder[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [currentTheme, setCurrentTheme] = useState<ColorTheme>(DEFAULT_THEME)
  const [mode, setModeState] = useState<ColorMode>('light')
  const [sharingFolderId, setSharingFolderId] = useState<string | null>(null)
  const [shareEmail, setShareEmail] = useState('')
  const [sharing, setSharing] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    setCurrentTheme(getSavedTheme())
    const saved = getSavedMode()
    if (saved) setModeState(saved)
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) setModeState('dark')
  }, [])

  function handleSetMode(next: ColorMode) {
    saveMode(next)
    setModeState(next)
  }

  useEffect(() => {
    if (!user) return
    claimUnownedFolders(user.uid)
  }, [user])

  useEffect(() => {
    if (!user) return
    return subscribeFolders(user.uid, user.email ?? '', setFolders)
  }, [user])

  if (loading || !user) return null

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = folders.findIndex((f) => f.id === active.id)
    const newIndex = folders.findIndex((f) => f.id === over.id)
    const reordered = arrayMove(folders, oldIndex, newIndex)
    setFolders(reordered)
    reorderFolders(reordered)
  }

  async function handleAddFolder(e: { preventDefault(): void }) {
    e.preventDefault()
    const name = newFolderName.trim()
    if (!name) return
    setSaving(true)
    await addFolder(name, user!.uid, user!.email ?? '')
    setNewFolderName('')
    setShowAddForm(false)
    setSaving(false)
  }

  function openEdit(folder: Folder) {
    setEditingFolder(folder)
    setEditName(folder.name)
  }

  function openShare(folder: Folder) {
    setSharingFolderId(folder.id)
    setShareEmail('')
  }

  const sharingFolder = folders.find((f) => f.id === sharingFolderId) ?? null

  async function handleAddShare(e: { preventDefault(): void }) {
    e.preventDefault()
    const email = shareEmail.trim().toLowerCase()
    if (!email || !sharingFolder) return
    setSharing(true)
    await shareFolder(sharingFolder.id, email)
    setShareEmail('')
    setSharing(false)
  }

  async function handleRemoveShare(email: string) {
    if (!sharingFolder) return
    await unshareFolder(sharingFolder.id, email)
  }

  async function handleEditFolder(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!editingFolder) return
    const name = editName.trim()
    if (!name) return
    setSaving(true)
    await updateFolder(editingFolder.id, name)
    setEditingFolder(null)
    setSaving(false)
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-gradient-primary text-white px-4 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">My Folders</h1>
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="text-white/80 hover:text-white p-2 -mr-2 transition-colors"
            aria-label="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
              <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </header>

      {/* settings backdrop + panel */}
      {showSettings && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)} />
          <div className="fixed top-[60px] right-4 w-56 surface-card rounded-2xl shadow-2xl z-50 p-4">
            <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-3">
              Appearance
            </p>
            <div className="flex gap-2 mb-4">
              {(['light', 'dark'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => handleSetMode(m)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                    mode === m
                      ? 'bg-gradient-primary text-white'
                      : 'bg-surface-muted text-ink-soft hover:text-ink'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-3">
              Color theme
            </p>
            <div className="grid grid-cols-5 gap-2">
              {colorThemes.map((theme) => (
                <button
                  key={theme.name}
                  title={theme.name}
                  onClick={() => {
                    saveTheme(theme)
                    setCurrentTheme(theme)
                    setShowSettings(false)
                  }}
                  style={{ backgroundColor: theme.primary }}
                  className={`w-9 h-9 rounded-full transition-transform hover:scale-110 active:scale-95 ${
                    currentTheme.name === theme.name
                      ? 'ring-2 ring-offset-2 ring-offset-surface ring-ink scale-105'
                      : ''
                  }`}
                  aria-label={theme.name}
                />
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-line">
              <p className="text-xs text-ink-faint truncate mb-2">{user.email}</p>
              <button
                onClick={async () => {
                  setShowSettings(false)
                  await signOut()
                  router.replace('/login')
                }}
                className="w-full text-left text-sm text-danger hover:text-danger-dark transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </>
      )}

      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">
        <div className="flex justify-center mb-4">
          <button
            onClick={() => setShowAddForm(true)}
            className="w-14 h-14 bg-gradient-primary text-white rounded-full shadow-md flex items-center justify-center text-2xl hover:brightness-95 active:brightness-90 active:scale-95 transition-transform"
            aria-label="Add folder"
          >
            +
          </button>
        </div>

        {folders.length === 0 && (
          <p className="text-ink-faint text-center mt-12">
            No folders yet. Create one to get started.
          </p>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={folders.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {folders.map((folder) => (
                <SortableFolderRow
                  key={folder.id}
                  folder={folder}
                  isOwner={folder.ownerId === user.uid}
                  onEdit={() => openEdit(folder)}
                  onShare={() => openShare(folder)}
                  onDelete={() => deleteFolder(folder.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </main>

      {showAddForm && (
        <Modal title="New Folder" onClose={() => { setShowAddForm(false); setNewFolderName('') }}>
          <form onSubmit={handleAddFolder}>
            <input
              autoFocus
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-primary mb-4"
            />
            <ModalButtons
              onCancel={() => { setShowAddForm(false); setNewFolderName('') }}
              submitLabel={saving ? 'Creating…' : 'Create'}
              disabled={saving || !newFolderName.trim()}
            />
          </form>
        </Modal>
      )}

      {editingFolder && (
        <Modal title="Rename Folder" onClose={() => setEditingFolder(null)}>
          <form onSubmit={handleEditFolder}>
            <input
              autoFocus
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-primary mb-4"
            />
            <ModalButtons
              onCancel={() => setEditingFolder(null)}
              submitLabel={saving ? 'Saving…' : 'Save'}
              disabled={saving || !editName.trim()}
            />
          </form>
        </Modal>
      )}

      {sharingFolder && (
        <Modal title={`Share "${sharingFolder.name}"`} onClose={() => setSharingFolderId(null)}>
          <p className="text-xs text-ink-soft mb-3">
            Anyone you add can view and edit this folder&apos;s notes by signing in with that
            Google account.
          </p>
          {sharingFolder.sharedWith.length > 0 && (
            <ul className="space-y-1 mb-4">
              {sharingFolder.sharedWith.map((email) => (
                <li
                  key={email}
                  className="flex items-center justify-between bg-surface-muted rounded-lg px-3 py-2 text-sm text-ink"
                >
                  <span className="truncate">{email}</span>
                  <button
                    onClick={() => handleRemoveShare(email)}
                    className="text-ink-faint hover:text-danger transition-colors p-1 -mr-1 ml-2 flex-shrink-0"
                    aria-label={`Remove ${email}`}
                  >
                    <XIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleAddShare} className="flex gap-2">
            <input
              type="email"
              placeholder="name@gmail.com"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              className="flex-1 min-w-0 border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={sharing || !shareEmail.trim()}
              className="px-4 py-2 rounded-lg bg-gradient-primary text-white text-sm font-medium hover:brightness-95 active:brightness-90 disabled:opacity-50 flex-shrink-0"
            >
              {sharing ? 'Adding…' : 'Add'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

function SortableFolderRow({
  folder,
  isOwner,
  onEdit,
  onShare,
  onDelete,
}: {
  folder: Folder
  isOwner: boolean
  onEdit: () => void
  onShare: () => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: folder.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center surface-card rounded-xl shadow-sm transition-shadow ${
        isDragging ? 'opacity-50 shadow-lg' : 'hover:shadow-md'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="pl-3 pr-2 py-4 text-ink-faint hover:text-ink-soft cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripIcon />
      </button>
      <Link
        href={`/folder/${folder.id}`}
        className="flex flex-1 items-center gap-3 py-4 min-w-0"
      >
        <span className="text-2xl">📁</span>
        <span className="font-medium text-ink truncate">{folder.name}</span>
        {!isOwner && (
          <span className="text-[10px] uppercase tracking-wide text-ink-faint bg-surface-muted rounded-full px-2 py-0.5 flex-shrink-0">
            Shared
          </span>
        )}
      </Link>
      <div className="flex items-center gap-1 pr-1">
        {isOwner && (
          <button
            onClick={onShare}
            className="text-ink-faint hover:text-ink-soft transition-colors p-2"
            aria-label="Share folder"
          >
            <ShareIcon />
          </button>
        )}
        <button
          onClick={onEdit}
          className="text-ink-faint hover:text-ink-soft transition-colors p-2"
          aria-label="Edit folder"
        >
          <EditIcon />
        </button>
        {isOwner && (
          <button
            onClick={onDelete}
            className="text-ink-faint hover:text-danger transition-colors p-2"
            aria-label="Delete folder"
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </li>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="surface-card rounded-2xl w-full max-w-sm p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4 text-ink">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function ModalButtons({
  onCancel,
  submitLabel,
  disabled,
}: {
  onCancel: () => void
  submitLabel: string
  disabled: boolean
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 py-2 rounded-lg border border-line text-sm text-ink-soft hover:bg-surface-muted"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={disabled}
        className="flex-1 py-2 rounded-lg bg-gradient-primary text-white text-sm font-medium hover:brightness-95 active:brightness-90 disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </div>
  )
}

function ShareIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.475l6.733-3.366A2.52 2.52 0 0 1 13 4.5Z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  )
}

function GripIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5.5" cy="3.5" r="1.2" />
      <circle cx="10.5" cy="3.5" r="1.2" />
      <circle cx="5.5" cy="8" r="1.2" />
      <circle cx="10.5" cy="8" r="1.2" />
      <circle cx="5.5" cy="12.5" r="1.2" />
      <circle cx="10.5" cy="12.5" r="1.2" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
    </svg>
  )
}
