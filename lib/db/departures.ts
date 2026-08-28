import { and, eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db/client'
import {
  accountEvents,
  approverChanges,
  attendanceExceptions,
  leaveGrants,
  leaveRequests,
  notifications,
  users,
} from '@/lib/db/schema'

export async function resignUser(params: {
  userId: number
  reason: string
  delegateTo?: number
  actorId: number
}): Promise<
  | { ok: true }
  | { error: 'NOT_FOUND' }
  | { error: 'SUPER_ADMIN_PROTECTED' }
  | { error: 'PENDING_APPROVALS'; pendingCount: number }
> {
  const [target] = await db.select().from(users).where(eq(users.id, params.userId))
  if (!target || target.signupStatus !== 'APPROVED') {
    return { error: 'NOT_FOUND' }
  }
  if (target.role === 'SUPER_ADMIN') {
    return { error: 'SUPER_ADMIN_PROTECTED' }
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
      // 위임 재배정 + 알림 발송 + 퇴사 처리 + 이력 기록을 하나의 트랜잭션으로 묶어(스펙
      // 5.1절) 중간에 실패해도 일부만 반영되지 않도록 한다.
      const delegateTo = params.delegateTo
      await db.transaction(async (tx) => {
        await tx
          .update(leaveRequests)
          .set({ approverId: delegateTo })
          .where(and(eq(leaveRequests.approverId, params.userId), eq(leaveRequests.status, 'PENDING')))

        for (const row of pending) {
          await tx.insert(notifications).values({
            recipientId: row.userId,
            type: 'APPROVER_CHANGED',
            refId: row.id,
            message: '담당 결재자의 퇴사 처리로 인해 이 신청의 결재자가 변경되었습니다.',
          })
        }

        await tx
          .update(users)
          .set({ signupStatus: 'RESIGNED', resignedAt: new Date(), resignReason: params.reason })
          .where(eq(users.id, params.userId))

        await tx.insert(accountEvents).values({
          userId: params.userId,
          actorId: params.actorId,
          action: 'RESIGNED',
          reason: params.reason,
        })
      })

      return { ok: true }
    }
  }

  // 계정 상태 변경과 이력 기록을 하나의 트랜잭션으로 묶어 이력 insert가 실패해도
  // 상태 변경만 반영되고 이력이 누락되는 일이 없도록 한다.
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ signupStatus: 'RESIGNED', resignedAt: new Date(), resignReason: params.reason })
      .where(eq(users.id, params.userId))

    await tx.insert(accountEvents).values({
      userId: params.userId,
      actorId: params.actorId,
      action: 'RESIGNED',
      reason: params.reason,
    })
  })

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
    // 되돌릴 수 없는 완전 삭제이므로 일곱 개의 삭제 문을 하나의 트랜잭션으로 묶어
    // 중간에 실패해도 일부 테이블만 삭제된 상태로 남지 않도록 한다.
    await db.transaction(async (tx) => {
      await tx.delete(leaveGrants).where(eq(leaveGrants.userId, userId))
      await tx.delete(leaveRequests).where(eq(leaveRequests.userId, userId))
      await tx.delete(notifications).where(eq(notifications.recipientId, userId))
      await tx.delete(approverChanges).where(eq(approverChanges.userId, userId))
      await tx.delete(attendanceExceptions).where(eq(attendanceExceptions.userId, userId))
      await tx.delete(accountEvents).where(eq(accountEvents.userId, userId))
      await tx.delete(users).where(eq(users.id, userId))
    })
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
      signupStatus: 'DELETED',
    })
    .where(eq(users.id, userId))
  await db.update(users).set({ defaultApproverId: null }).where(eq(users.defaultApproverId, userId))
  return { ok: true }
}
