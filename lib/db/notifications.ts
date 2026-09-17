// lib/db/notifications.ts
import { and, count, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { notifications } from '@/lib/db/schema'

export type Notification = typeof notifications.$inferSelect

export async function createNotification(params: {
  recipientId: number
  type: string
  refId: number
  message: string
}): Promise<void> {
  await db.insert(notifications).values(params)
}

// 최신 20건 조회 (읽음 여부 무관, 최신순)
export async function getNotifications(userId: number): Promise<Notification[]> {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(20)
}

// 미읽음 수
export async function getUnreadCount(userId: number): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(notifications)
    .where(and(eq(notifications.recipientId, userId), eq(notifications.read, false)))
  return result[0]?.count ?? 0
}

// 단건 읽음 처리 (본인 소유 검증 포함)
export async function markAsRead(id: number, userId: number): Promise<boolean> {
  const result = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, id), eq(notifications.recipientId, userId)))
    .returning({ id: notifications.id })
  return result.length > 0
}

// 전체 읽음 처리 — 업데이트된 행 수 반환
export async function markAllAsRead(userId: number): Promise<number> {
  const result = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.recipientId, userId), eq(notifications.read, false)))
    .returning({ id: notifications.id })
  return result.length
}
