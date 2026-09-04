import { and, eq, inArray, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leaveRequests, users } from '@/lib/db/schema'

// 본인이 신청한 문서 중 결재 대기(PENDING) 건수. type='ADJUSTMENT'(관리자 수동 조정 기록)는
// 실제 신청 문서가 아니므로 제외한다.
export async function getPendingRequestCountForRequester(userId: number): Promise<number> {
  const rows = await db
    .select({ id: leaveRequests.id })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.userId, userId),
        eq(leaveRequests.status, 'PENDING'),
        ne(leaveRequests.type, 'ADJUSTMENT')
      )
    )
  return rows.length
}

// 본인이 결재자로 지정된 문서 중 대기/처리완료 건수. 처리완료는 본인이 직접 승인·반려한
// 것만 집계한다 — 신청인이 스스로 취소(CANCELED)한 문서는 본인이 처리한 게 아니므로 제외한다.
export async function getApprovalCounts(approverId: number): Promise<{ pending: number; processed: number }> {
  const rows = await db
    .select({ status: leaveRequests.status })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.approverId, approverId), ne(leaveRequests.type, 'ADJUSTMENT')))
  let pending = 0
  let processed = 0
  for (const row of rows) {
    if (row.status === 'PENDING') pending += 1
    else if (row.status === 'APPROVED' || row.status === 'REJECTED') processed += 1
  }
  return { pending, processed }
}

// 본인이 기본 결재자로 지정된 재직(APPROVED) 프리랜서 수.
export async function getAssignedFreelancerCount(approverId: number): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.role, 'FREELANCER'),
        eq(users.signupStatus, 'APPROVED'),
        eq(users.defaultApproverId, approverId)
      )
    )
  return rows.length
}

// 재직 중인 프리랜서 전체 수(SUPER_ADMIN "전체 현황"용).
export async function getActiveFreelancerCount(): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'FREELANCER'), eq(users.signupStatus, 'APPROVED')))
  return rows.length
}

// 결재자(APPROVER+SUPER_ADMIN) 전체 수(재직 상태만).
export async function getApproverCount(): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ['APPROVER', 'SUPER_ADMIN']), eq(users.signupStatus, 'APPROVED')))
  return rows.length
}

// 가입 승인 대기(PENDING) 계정 수.
export async function getPendingSignupCount(): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.signupStatus, 'PENDING'))
  return rows.length
}
