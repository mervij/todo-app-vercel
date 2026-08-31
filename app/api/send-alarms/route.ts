import { NextRequest, NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import webpush from 'web-push'
import { getAdminDb } from '@/lib/firebase-admin'

// Always re-run against live Firestore/current time — never cache this route.
export const dynamic = 'force-dynamic'

type PushSubscriptionRecord = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

function statusCodeOf(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null && 'statusCode' in err
    ? (err as { statusCode?: number }).statusCode
    : undefined
}

// Triggered by Vercel Cron (see vercel.json) every few minutes. Finds notes
// whose alarm has come due, pushes a notification to everyone with access to
// that note's folder, then clears the alarm so it fires only once.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return NextResponse.json({ error: 'VAPID keys are not configured' }, { status: 500 })
  }
  if (
    !process.env.FIREBASE_ADMIN_PROJECT_ID ||
    !process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    !process.env.FIREBASE_ADMIN_PRIVATE_KEY
  ) {
    return NextResponse.json({ error: 'Firebase admin credentials are not configured' }, { status: 500 })
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:example@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )

  const adminDb = getAdminDb()
  const dueNotes = await adminDb
    .collectionGroup('notes')
    .where('alarmAt', '<=', Timestamp.now())
    .get()

  let sent = 0
  let cleaned = 0

  for (const noteDoc of dueNotes.docs) {
    const folderRef = noteDoc.ref.parent.parent
    if (!folderRef) continue

    const folderSnap = await folderRef.get()
    const folder = folderSnap.data() as { ownerEmail?: string; sharedWith?: string[] } | undefined
    if (!folder) continue

    const emails = [folder.ownerEmail, ...(folder.sharedWith ?? [])].filter(
      (email): email is string => Boolean(email)
    )

    if (emails.length > 0) {
      const subsSnap = await adminDb
        .collection('pushSubscriptions')
        .where('email', 'in', emails.slice(0, 30))
        .get()

      const note = noteDoc.data() as { title?: string; content?: string }
      const payload = JSON.stringify({
        title: note.title || 'Reminder',
        body: note.content || '',
        url: `/folder/${folderRef.id}`,
      })

      await Promise.all(
        subsSnap.docs.map(async (subDoc) => {
          const sub = subDoc.data() as PushSubscriptionRecord
          try {
            await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload)
            sent++
          } catch (err) {
            const code = statusCodeOf(err)
            if (code === 404 || code === 410) {
              await subDoc.ref.delete()
              cleaned++
            } else {
              console.error('send-alarms: push failed', err)
            }
          }
        })
      )
    }

    // One-shot reminder: clear it so the next cron run doesn't resend it.
    await noteDoc.ref.update({ alarmAt: null })
  }

  return NextResponse.json({ checked: dueNotes.size, sent, cleaned })
}
