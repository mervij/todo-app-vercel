'use client'

import { use, useState, useEffect } from 'react'
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
  subscribeNotes,
  addNote,
  updateNote,
  reorderNotes,
  moveNotes,
  deleteNotes,
  toggleNote,
  deleteNote,
  type Folder,
  type Note,
} from '@/lib/firestore'
import { enablePushNotifications } from '@/lib/push'
import { useAuth } from '@/app/auth-provider'

// Reminders always fire in the evening — Vercel Cron on the Hobby plan only
// allows one run per day, so there's no point offering a time picker.
const ALARM_HOUR = 21

// <input type="date"> wants "YYYY-MM-DD" in local time, with no timezone.
function toDateInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function alarmToInputValue(alarmAt: Note['alarmAt']) {
  return alarmAt ? toDateInputValue(alarmAt.toDate()) : ''
}

// Converts a "YYYY-MM-DD" input value into the fixed 9pm reminder instant,
// in the browser's local time zone.
function dateInputToAlarm(value: string): Date | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, ALARM_HOUR, 0, 0)
}

function formatAlarm(alarmAt: Note['alarmAt']) {
  if (!alarmAt) return null
  const date = alarmAt.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${date}, evening`
}

export default function FolderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: folderId } = use(params)
  const { user, loading } = useAuth()
  const router = useRouter()

  const [folderName, setFolderName] = useState('')
  const [allFolders, setAllFolders] = useState<Folder[]>([])
  const [notes, setNotes] = useState<Note[]>([])

  // add / edit
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newAlarm, setNewAlarm] = useState('')
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editAlarm, setEditAlarm] = useState('')
  const [saving, setSaving] = useState(false)

  // selection + move + delete
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [moving, setMoving] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
    if (!user) return
    return subscribeFolders(user.uid, user.email ?? '', (folders) => {
      const folder = folders.find((f) => f.id === folderId)
      if (folder) setFolderName(folder.name)
      setAllFolders(folders)
    })
  }, [folderId, user])

  useEffect(() => {
    if (!user) return
    return subscribeNotes(folderId, setNotes)
  }, [folderId, user])

  const pending = notes.filter((n) => !n.completed)
  const done = notes.filter((n) => n.completed)
  const otherFolders = allFolders.filter((f) => f.id !== folderId)
  const allSelected = notes.length > 0 && notes.every((n) => selectedIds.has(n.id))

  // --- selection ---
  function toggleSelection(noteId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(notes.map((n) => n.id)))
    }
  }

  function cancelSelection() {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  async function handleMove(targetFolderId: string) {
    setMoving(true)
    await moveNotes(folderId, Array.from(selectedIds), targetFolderId, notes)
    setMoving(false)
    setShowFolderPicker(false)
    cancelSelection()
  }

  async function handleDeleteSelected() {
    setDeleting(true)
    await deleteNotes(folderId, Array.from(selectedIds))
    setDeleting(false)
    setShowDeleteConfirm(false)
    cancelSelection()
  }

  // --- drag & drop ---
  function handlePendingDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = pending.findIndex((n) => n.id === active.id)
    const newIndex = pending.findIndex((n) => n.id === over.id)
    const reordered = [...arrayMove(pending, oldIndex, newIndex), ...done]
    setNotes(reordered)
    reorderNotes(folderId, reordered)
  }

  function handleDoneDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = done.findIndex((n) => n.id === active.id)
    const newIndex = done.findIndex((n) => n.id === over.id)
    const reordered = [...pending, ...arrayMove(done, oldIndex, newIndex)]
    setNotes(reordered)
    reorderNotes(folderId, reordered)
  }

  // --- add / edit ---
  async function handleAddNote(e: { preventDefault(): void }) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setSaving(true)
    const alarmAt = dateInputToAlarm(newAlarm)
    if (alarmAt && user?.email) await enablePushNotifications(user.email)
    await addNote(folderId, title, newContent.trim(), alarmAt)
    setNewTitle('')
    setNewContent('')
    setNewAlarm('')
    setShowAddForm(false)
    setSaving(false)
  }

  function openEdit(note: Note) {
    setEditingNote(note)
    setEditTitle(note.title)
    setEditContent(note.content)
    setEditAlarm(alarmToInputValue(note.alarmAt))
  }

  async function handleEditNote(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!editingNote) return
    const title = editTitle.trim()
    if (!title) return
    setSaving(true)
    const alarmAt = dateInputToAlarm(editAlarm)
    if (alarmAt && user?.email) await enablePushNotifications(user.email)
    await updateNote(folderId, editingNote.id, title, editContent.trim(), alarmAt)
    setEditingNote(null)
    setSaving(false)
  }

  if (loading || !user) return null

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── header ── */}
      <header className="bg-gradient-primary text-white px-4 py-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {!selectionMode && (
            <Link href="/" className="text-white/80 hover:text-white transition-colors flex-shrink-0 -ml-1 p-1">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
              </svg>
            </Link>
          )}
          <h1 className="text-xl font-semibold truncate">
            {selectionMode
              ? `${selectedIds.size} selected`
              : (folderName || 'Folder')}
          </h1>
        </div>
        <button
          onClick={selectionMode ? cancelSelection : () => setSelectionMode(true)}
          className="text-white/90 hover:text-white text-sm font-medium flex-shrink-0 ml-4"
        >
          {selectionMode ? 'Cancel' : 'Select'}
        </button>
      </header>

      {/* ── main content ── */}
      <main className={`flex-1 px-4 py-4 max-w-lg mx-auto w-full ${selectionMode ? 'pb-28' : ''}`}>
        {!selectionMode && (
          <div className="flex justify-center mb-4">
            <button
              onClick={() => setShowAddForm(true)}
              className="w-14 h-14 bg-gradient-primary text-white rounded-full shadow-md flex items-center justify-center text-2xl hover:brightness-95 active:brightness-90 active:scale-95 transition-transform"
              aria-label="Add note"
            >
              +
            </button>
          </div>
        )}

        {selectionMode && notes.length > 0 && (
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-sm text-ink-soft">
              {selectedIds.size} of {notes.length} selected
            </span>
            <button
              onClick={toggleSelectAll}
              className="text-sm font-medium text-primary hover:text-primary-dark"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
        )}

        {notes.length === 0 && (
          <p className="text-ink-faint text-center mt-12">
            No notes yet. Tap + to add one.
          </p>
        )}

        {/* pending notes */}
        {pending.length > 0 && (
          <section className="mb-6">
            {selectionMode ? (
              <ul className="space-y-2">
                {pending.map((note) => (
                  <SelectableNoteItem
                    key={note.id}
                    note={note}
                    isSelected={selectedIds.has(note.id)}
                    onSelect={() => toggleSelection(note.id)}
                  />
                ))}
              </ul>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePendingDragEnd}>
                <SortableContext items={pending.map((n) => n.id)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-2">
                    {pending.map((note) => (
                      <SortableNoteItem
                        key={note.id}
                        note={note}
                        onToggle={() => toggleNote(folderId, note.id, !note.completed)}
                        onEdit={() => openEdit(note)}
                        onDelete={() => deleteNote(folderId, note.id)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </section>
        )}

        {/* done notes */}
        {done.length > 0 && (
          <section>
            <p className="text-xs text-ink-faint uppercase tracking-wide mb-2 font-medium">
              Completed ({done.length})
            </p>
            {selectionMode ? (
              <ul className="space-y-2">
                {done.map((note) => (
                  <SelectableNoteItem
                    key={note.id}
                    note={note}
                    isSelected={selectedIds.has(note.id)}
                    onSelect={() => toggleSelection(note.id)}
                  />
                ))}
              </ul>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDoneDragEnd}>
                <SortableContext items={done.map((n) => n.id)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-2">
                    {done.map((note) => (
                      <SortableNoteItem
                        key={note.id}
                        note={note}
                        onToggle={() => toggleNote(folderId, note.id, !note.completed)}
                        onEdit={() => openEdit(note)}
                        onDelete={() => deleteNote(folderId, note.id)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </section>
        )}
      </main>

      {/* ── selection bottom bar ── */}
      {selectionMode && (
        <div className="fixed bottom-0 left-0 right-0 surface-card border-t border-line px-4 py-4 z-40">
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={selectedIds.size === 0}
              className="flex-1 py-3 rounded-xl border border-danger text-danger font-medium text-sm disabled:opacity-40 hover:bg-danger-soft transition-colors"
            >
              Delete ({selectedIds.size})
            </button>
            <button
              onClick={() => setShowFolderPicker(true)}
              disabled={selectedIds.size === 0}
              className="flex-1 py-3 rounded-xl bg-gradient-primary text-white font-medium text-sm disabled:opacity-40 hover:brightness-95 transition-colors"
            >
              Move to folder
            </button>
          </div>
        </div>
      )}

      {/* ── add note modal ── */}
      {showAddForm && (
        <Modal title="New Note" onClose={() => { setShowAddForm(false); setNewTitle(''); setNewContent(''); setNewAlarm('') }}>
          <form onSubmit={handleAddNote}>
            <input
              autoFocus
              type="text"
              placeholder="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-primary mb-2"
            />
            <textarea
              placeholder="Notes (optional)"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={3}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-primary mb-2 resize-none"
            />
            <label className="block text-xs font-medium text-ink-soft mb-1">Remind me on (evening)</label>
            <input
              type="date"
              value={newAlarm}
              onChange={(e) => setNewAlarm(e.target.value)}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-primary mb-4"
            />
            <ModalButtons
              onCancel={() => { setShowAddForm(false); setNewTitle(''); setNewContent(''); setNewAlarm('') }}
              submitLabel={saving ? 'Adding…' : 'Add'}
              disabled={saving || !newTitle.trim()}
            />
          </form>
        </Modal>
      )}

      {/* ── edit note modal ── */}
      {editingNote && (
        <Modal title="Edit Note" onClose={() => setEditingNote(null)}>
          <form onSubmit={handleEditNote}>
            <input
              autoFocus
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-primary mb-2"
            />
            <textarea
              placeholder="Notes (optional)"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-primary mb-2 resize-none"
            />
            <label className="block text-xs font-medium text-ink-soft mb-1">Remind me on (evening)</label>
            <div className="flex gap-2 mb-4">
              <input
                type="date"
                value={editAlarm}
                onChange={(e) => setEditAlarm(e.target.value)}
                className="flex-1 min-w-0 border border-line rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
              {editAlarm && (
                <button
                  type="button"
                  onClick={() => setEditAlarm('')}
                  className="px-3 rounded-lg border border-line text-sm text-ink-soft hover:bg-surface-muted"
                >
                  Clear
                </button>
              )}
            </div>
            <ModalButtons
              onCancel={() => setEditingNote(null)}
              submitLabel={saving ? 'Saving…' : 'Save'}
              disabled={saving || !editTitle.trim()}
            />
          </form>
        </Modal>
      )}

      {/* ── delete confirmation modal ── */}
      {showDeleteConfirm && (
        <Modal
          title={`Delete ${selectedIds.size} note${selectedIds.size !== 1 ? 's' : ''}?`}
          onClose={() => setShowDeleteConfirm(false)}
        >
          <p className="text-sm text-ink-soft mb-4">This cannot be undone.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-2 rounded-lg border border-line text-sm text-ink-soft hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="flex-1 py-2 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger-dark disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── folder picker modal ── */}
      {showFolderPicker && (
        <Modal
          title={`Move ${selectedIds.size} note${selectedIds.size !== 1 ? 's' : ''} to…`}
          onClose={() => setShowFolderPicker(false)}
        >
          {otherFolders.length === 0 ? (
            <p className="text-ink-faint text-sm text-center py-4">No other folders available.</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {otherFolders.map((folder) => (
                <li key={folder.id}>
                  <button
                    onClick={() => handleMove(folder.id)}
                    disabled={moving}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-muted hover:bg-surface text-left disabled:opacity-50 transition-colors"
                  >
                    <span className="text-xl">📁</span>
                    <span className="font-medium text-ink">{folder.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {moving && (
            <p className="text-center text-sm text-ink-faint mt-3">Moving…</p>
          )}
        </Modal>
      )}
    </div>
  )
}

// ── selectable note (selection mode) ──────────────────────────────────────────

function SelectableNoteItem({
  note,
  isSelected,
  onSelect,
}: {
  note: Note
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <li
      onClick={onSelect}
      className={`flex items-center gap-3 surface-card rounded-xl px-4 py-3 shadow-sm cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <div
        className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          isSelected ? 'bg-primary border-primary' : 'border-line'
        }`}
      >
        {isSelected && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="w-4 h-4">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${note.completed ? 'line-through text-ink-faint' : 'text-ink'}`}>
          {note.title}
        </p>
        {note.content && (
          <p className={`text-xs mt-0.5 ${note.completed ? 'text-ink-faint' : 'text-ink-soft'}`}>
            {note.content}
          </p>
        )}
        {formatAlarm(note.alarmAt) && (
          <AlarmBadge label={formatAlarm(note.alarmAt)!} className="mt-1" />
        )}
      </div>
    </li>
  )
}

// ── sortable note (normal mode) ───────────────────────────────────────────────

function SortableNoteItem({
  note,
  onToggle,
  onEdit,
  onDelete,
}: {
  note: Note
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: note.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-2 surface-card rounded-xl shadow-sm ${isDragging ? 'opacity-50 shadow-lg' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="pl-3 pr-1 py-3 text-ink-faint hover:text-ink-soft cursor-grab active:cursor-grabbing touch-none flex-shrink-0 mt-0.5"
        aria-label="Drag to reorder"
      >
        <GripIcon />
      </button>
      <button
        onClick={onToggle}
        className={`mt-3 w-6 h-6 rounded-full border-2 flex-shrink-0 transition-colors ${
          note.completed ? 'bg-green-400 border-green-400' : 'border-line hover:border-primary'
        }`}
        aria-label={note.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {note.completed && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="w-full h-full p-0.5">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0 py-3">
        <p className={`text-sm font-medium ${note.completed ? 'line-through text-ink-faint' : 'text-ink'}`}>
          {note.title}
        </p>
        {note.content && (
          <p className={`text-xs mt-0.5 ${note.completed ? 'text-ink-faint' : 'text-ink-soft'}`}>
            {note.content}
          </p>
        )}
        {formatAlarm(note.alarmAt) && (
          <AlarmBadge label={formatAlarm(note.alarmAt)!} className="mt-1" />
        )}
      </div>
      <div className="flex items-center gap-1 pr-1 pt-1 flex-shrink-0">
        <button onClick={onEdit} className="text-ink-faint hover:text-ink-soft transition-colors p-2" aria-label="Edit note">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
          </svg>
        </button>
        <button onClick={onDelete} className="text-ink-faint hover:text-danger transition-colors p-2" aria-label="Delete note">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </li>
  )
}

// ── shared modal components ───────────────────────────────────────────────────

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

function AlarmBadge({ label, className = '' }: { label: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium text-primary ${className}`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .199.079.39.22.53l3.5 3.5a.75.75 0 1 0 1.06-1.06L10.75 9.69V5Z" clipRule="evenodd" />
      </svg>
      {label}
    </span>
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
