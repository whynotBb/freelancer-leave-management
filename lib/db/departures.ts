import { and, eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db/client'
import {
  approverChanges,
  attendanceExceptions,
  leaveGrants,
  leaveRequests,
  notifications,
  users,
} from '@/lib/db/schema'
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

export interface DepartedUser {
  id: number
  name: string
  email: string
  role: 'FREELANCER' | 'APPROVER'
  resignedAt: string | null
  resignReason: string | null
}

export async function listDepartedUsers(): Promise<DepartedUser[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      resignedAt: users.resignedAt,
      resignReason: users.resignReason,
    })
    .from(users)
    .where(eq(users.signupStatus, 'RESIGNED'))

  return rows.map((r) => ({
    ...r,
    role: r.role as 'FREELANCER' | 'APPROVER',
    resignedAt: r.resignedAt ? r.resignedAt.toISOString() : null,
  }))
}

export async function restoreUser(userId: number): Promise<{ ok: true } | { error: string }> {
  const [target] = await db.select().from(users).where(eq(users.id, userId))
  if (!target || target.signupStatus !== 'RESIGNED') {
    return { error: '퇴사 처리된 사용자가 아닙니다.' }
  }
  await db
    .update(users)
    .set({ signupStatus: 'APPROVED', resignedAt: null, resignReason: null })
    .where(eq(users.id, userId))
  return { ok: true }
}

export async function deleteDepartedUser(userId: number): Promise<{ ok: true } | { error: string }> {
  const [target] = await db.select().from(users).where(eq(users.id, userId))
  if (!target || target.signupStatus !== 'RESIGNED') {
    return { error: '퇴사 처리된 사용자가 아닙니다.' }
  }

  if (target.role === 'FREELANCER') {
    await db.delete(leaveGrants).where(eq(leaveGrants.userId, userId))
    await db.delete(leaveRequests).where(eq(leaveRequests.userId, userId))
    await db.delete(notifications).where(eq(notifications.recipientId, userId))
    await db.delete(approverChanges).where(eq(approverChanges.userId, userId))
    await db.delete(attendanceExceptions).where(eq(attendanceExceptions.userId, userId))
    await db.delete(users).where(eq(users.id, userId))
    return { ok: true }
  }

  // 결재자는 leave_requests.approver_id 등 다른 사람의 이력에 이 id가 참조되어 있으므로
  // row는 남기고 개인정보만 익명화한다(스펙 3장).
  await db
    .update(users)
    .set({
      name: `사용자#${userId}(퇴사)`,
      email: `deleted-${userId}@deleted.local`,
      passwordHash: await bcrypt.hash(randomUUID(), 10),
    })
    .where(eq(users.id, userId))
  await db.update(users).set({ defaultApproverId: null }).where(eq(users.defaultApproverId, userId))
  return { ok: true }
}
