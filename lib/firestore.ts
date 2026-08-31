import {
  collection,
  addDoc,
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'

export type Folder = {
  id: string
  name: string
  order?: number
  createdAt: Timestamp | null
  ownerId: string
  ownerEmail?: string
  sharedWith: string[]
}

export type Note = {
  id: string
  title: string
  content: string
  completed: boolean
  order?: number
  createdAt: Timestamp | null
  alarmAt: Timestamp | null
}

function sortByOrder<T extends { order?: number; createdAt: Timestamp | null }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    // Items with an explicit order come first (sorted by that value).
    // Items without order fall back to their createdAt timestamp.
    const aKey = a.order !== undefined ? a.order : (a.createdAt?.toMillis() ?? 0) + 1e13
    const bKey = b.order !== undefined ? b.order : (b.createdAt?.toMillis() ?? 0) + 1e13
    return aKey - bKey
  })
}

export function subscribeFolders(
  uid: string,
  email: string,
  callback: (folders: Folder[]) => void
) {
  const owned = new Map<string, Folder>()
  const shared = new Map<string, Folder>()

  function emit() {
    const merged = new Map([...owned, ...shared])
    callback(sortByOrder([...merged.values()]))
  }

  const unsubOwned = onSnapshot(
    query(collection(db, 'folders'), where('ownerId', '==', uid)),
    (snapshot) => {
      owned.clear()
      snapshot.docs.forEach((docSnap) => {
        owned.set(docSnap.id, { id: docSnap.id, ...(docSnap.data() as Omit<Folder, 'id'>) })
      })
      emit()
    },
    (error) => console.error('subscribeFolders (owned):', error)
  )

  const unsubShared = email
    ? onSnapshot(
        query(collection(db, 'folders'), where('sharedWith', 'array-contains', email)),
        (snapshot) => {
          shared.clear()
          snapshot.docs.forEach((docSnap) => {
            shared.set(docSnap.id, { id: docSnap.id, ...(docSnap.data() as Omit<Folder, 'id'>) })
          })
          emit()
        },
        (error) => console.error('subscribeFolders (shared):', error)
      )
    : null

  return () => {
    unsubOwned()
    unsubShared?.()
  }
}

export async function addFolder(name: string, ownerId: string, ownerEmail: string) {
  await addDoc(collection(db, 'folders'), {
    name,
    order: Date.now(),
    createdAt: serverTimestamp(),
    ownerId,
    ownerEmail,
    sharedWith: [],
  })
}

export async function shareFolder(folderId: string, email: string) {
  await updateDoc(doc(db, 'folders', folderId), {
    sharedWith: arrayUnion(email.trim().toLowerCase()),
  })
}

export async function unshareFolder(folderId: string, email: string) {
  await updateDoc(doc(db, 'folders', folderId), {
    sharedWith: arrayRemove(email),
  })
}

// One-time migration: claims any pre-sharing-feature folders (created before
// ownerId existed) for the current user. Only works while Firestore rules
// still allow an unfiltered read of the folders collection — once the
// ownership-based rules are live, an unfiltered list query is rejected
// outright, so this becomes a harmless no-op (caught and ignored below).
export async function claimUnownedFolders(uid: string) {
  try {
    const snapshot = await getDocs(collection(db, 'folders'))
    const batch = writeBatch(db)
    let hasWrites = false
    snapshot.docs.forEach((docSnap) => {
      if (!docSnap.data().ownerId) {
        batch.update(docSnap.ref, { ownerId: uid, sharedWith: [] })
        hasWrites = true
      }
    })
    if (hasWrites) await batch.commit()
  } catch {
    // Rules already restrict folder listing to owner/shared — nothing to migrate.
  }
}

export async function updateFolder(folderId: string, name: string) {
  await updateDoc(doc(db, 'folders', folderId), { name })
}

export async function reorderFolders(folders: Folder[]) {
  const batch = writeBatch(db)
  folders.forEach((folder, index) => {
    batch.update(doc(db, 'folders', folder.id), { order: index })
  })
  await batch.commit()
}

export async function deleteFolder(folderId: string) {
  await deleteDoc(doc(db, 'folders', folderId))
}

export function subscribeNotes(
  folderId: string,
  callback: (notes: Note[]) => void
) {
  return onSnapshot(
    collection(db, 'folders', folderId, 'notes'),
    (snapshot) => {
      const notes: Note[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Note, 'id'>),
      }))
      callback(sortByOrder(notes))
    },
    (error) => console.error('subscribeNotes:', error)
  )
}

export async function addNote(
  folderId: string,
  title: string,
  content: string,
  alarmAt: Date | null
) {
  await addDoc(collection(db, 'folders', folderId, 'notes'), {
    title,
    content,
    completed: false,
    order: Date.now(),
    createdAt: serverTimestamp(),
    alarmAt: alarmAt ? Timestamp.fromDate(alarmAt) : null,
  })
}

export async function updateNote(
  folderId: string,
  noteId: string,
  title: string,
  content: string,
  alarmAt: Date | null
) {
  await updateDoc(doc(db, 'folders', folderId, 'notes', noteId), {
    title,
    content,
    alarmAt: alarmAt ? Timestamp.fromDate(alarmAt) : null,
  })
}

export async function reorderNotes(folderId: string, notes: Note[]) {
  const batch = writeBatch(db)
  notes.forEach((note, index) => {
    batch.update(doc(db, 'folders', folderId, 'notes', note.id), {
      order: index,
    })
  })
  await batch.commit()
}

export async function toggleNote(
  folderId: string,
  noteId: string,
  completed: boolean
) {
  await updateDoc(doc(db, 'folders', folderId, 'notes', noteId), { completed })
}

export async function deleteNotes(folderId: string, noteIds: string[]) {
  const batch = writeBatch(db)
  noteIds.forEach((noteId) => {
    batch.delete(doc(db, 'folders', folderId, 'notes', noteId))
  })
  await batch.commit()
}

export async function moveNotes(
  sourceFolderId: string,
  noteIds: string[],
  targetFolderId: string,
  allNotes: Note[]
) {
  const batch = writeBatch(db)
  for (const noteId of noteIds) {
    const note = allNotes.find((n) => n.id === noteId)
    if (!note) continue
    const newRef = doc(collection(db, 'folders', targetFolderId, 'notes'))
    batch.set(newRef, {
      title: note.title,
      content: note.content,
      completed: note.completed,
      order: Date.now(),
      createdAt: serverTimestamp(),
      alarmAt: note.alarmAt ?? null,
    })
    batch.delete(doc(db, 'folders', sourceFolderId, 'notes', noteId))
  }
  await batch.commit()
}

export async function deleteNote(folderId: string, noteId: string) {
  await deleteDoc(doc(db, 'folders', folderId, 'notes', noteId))
}

// Push subscriptions are keyed by a hash of their endpoint so re-subscribing
// the same device/browser overwrites its old entry instead of duplicating it.
async function subscriptionId(endpoint: string) {
  const bytes = new TextEncoder().encode(endpoint)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function savePushSubscription(email: string, subscription: PushSubscriptionJSON) {
  if (!subscription.endpoint || !subscription.keys) return
  const id = await subscriptionId(subscription.endpoint)
  await setDoc(doc(db, 'pushSubscriptions', id), {
    email: email.trim().toLowerCase(),
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    createdAt: serverTimestamp(),
  })
}

export async function deletePushSubscription(endpoint: string) {
  const id = await subscriptionId(endpoint)
  await deleteDoc(doc(db, 'pushSubscriptions', id))
}
