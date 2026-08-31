import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Server-only: uses a service account, so it can read/write across every
// user's data regardless of the client-facing Firestore security rules.
// Never import this from a 'use client' file.
//
// Initialization is deferred to first use (not module load) — Next.js
// evaluates route modules while collecting page data at build time, and
// the admin credentials aren't available (or needed) then.
export function getAdminDb() {
  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })

  return getFirestore(app)
}
