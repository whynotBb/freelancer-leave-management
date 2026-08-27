import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leaveRequests, users } from '@/lib/db/schema'
import { createNotification } from '@/lib/db/notifications'

export async function resignUser(params: {
  userId: number
  reason: string
  delegateTo?: number
}): Promise<
  { ok: true } | { error: 'NOT_FOUND' } | { error: 'PENDING_APPROVALS'; pendingCount: number }
> {
  const [target] = await db.select().from(users).where(eq(users.id, params.userId))
  if (!target) {
    return { error: 'NOT_FOUND' }
  }

  if (target.role === 'APPROVER') {
    const pending = await db
      .select({ id: leaveRequests.id, userId: leaveRequests.userId })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.approverId, params.userId), eq(leaveRequests.status, 'PENDING')))

    if (pending.length > 0 && !params.delegateTo) {
      return { error: 'PENDING_APPROVALS', pendingCount: pending.length }
    }

    if (pending.length > 0 && params.delegateTo) {
      await db
        .update(leaveRequests)
        .set({ approverId: params.delegateTo })
        .where(and(eq(leaveRequests.approverId, params.userId), eq(leaveRequests.status, 'PENDING')))

      for (const row of pending) {
        await createNotification({
          recipientId: row.userId,
          type: 'APPROVER_CHANGED',
          refId: row.id,
          message: '담당 결재자의 퇴사 처리로 인해 이 신청의 결재자가 변경되었습니다.',
        })
      }
    }
  }

  await db
    .update(users)
    .set({ signupStatus: 'RESIGNED', resignedAt: new Date(), resignReason: params.reason })
    .where(eq(users.id, params.userId))

  return { ok: true }
}
