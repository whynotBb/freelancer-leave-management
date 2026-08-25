// lib/db/notifications.ts
import { db } from '@/lib/db/client'
import { notifications } from '@/lib/db/schema'

export async function createNotification(params: {
  recipientId: number
  type: string
  refId: number
  message: string
}): Promise<void> {
  await db.insert(notifications).values(params)
}
