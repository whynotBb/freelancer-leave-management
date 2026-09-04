import { and, eq, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'
import { leaveGrants, leaveRequests, users } from '@/lib/db/schema'
import { getLeaveBalance } from '@/lib/db/leave-adjustments'
import { applyTransition, type LeaveRequestStatus } from '@/lib/domain/leave-workflow'
import { hasConflictingActiveRequest, isBeyondBackdateLimit, type LeaveRequestType } from '@/lib/domain/leave-validation'
import {
  buildMyDocumentTimeline,
  type MyDocumentEntry,
  type MyLeaveRequestRow,
} from '@/lib/domain/my-document-timeline'
import { getMonthsOfService } from '@/lib/domain/date-utils'

export interface MyDocumentSummary {
  hireDate: string | null
  monthsOfService: number | null
  granted: number
  used: number
  remaining: number
  defaultApproverId: number | null
}

export async function getMyDocumentSummary(userId: number): Promise<MyDocumentSummary> {
  const [user] = await db
    .select({ hireDate: users.hireDate, defaultApproverId: users.defaultApproverId })
    .from(users)
    .where(eq(users.id, userId))

  if (!user?.hireDate) {
    return {
      hireDate: null,
      monthsOfService: null,
      granted: 0,
      used: 0,
      remaining: 0,
      defaultApproverId: user?.defaultApproverId ?? null,
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const balance = await getLeaveBalance(userId, user.hireDate, today)
  return {
    hireDate: user.hireDate,
    monthsOfService: getMonthsOfService(user.hireDate, today),
    granted: balance.granted,
    used: balance.used,
    remaining: balance.remaining,
    defaultApproverId: user.defaultApproverId,
  }
}

export async function getMyDocumentTimeline(userId: number): Promise<MyDocumentEntry[]> {
  const approver = alias(users, 'approver')
  const requestRows = await db
    .select({
      id: leaveRequests.id,
      title: leaveRequests.title,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      type: leaveRequests.type,
      requestedDays: leaveRequests.requestedDays,
      status: leaveRequests.status,
      reason: leaveRequests.reason,
      approverId: leaveRequests.approverId,
      approverName: approver.name,
      rejectReason: leaveRequests.rejectReason,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .leftJoin(approver, eq(leaveRequests.approverId, approver.id))
    .where(eq(leaveRequests.userId, userId))

  const creator = alias(users, 'creator')
  const grantRows = await db
    .select({
      amount: leaveGrants.amount,
      note: leaveGrants.note,
      createdBy: leaveGrants.createdBy,
      createdByName: creator.name,
      createdAt: leaveGrants.createdAt,
    })
    .from(leaveGrants)
    .leftJoin(creator, eq(leaveGrants.createdBy, creator.id))
    .where(eq(leaveGrants.userId, userId))

  return buildMyDocumentTimeline({
    requests: requestRows.map(
      (r): MyLeaveRequestRow => ({
        ...r,
        type: r.type as MyLeaveRequestRow['type'],
        status: r.status as MyLeaveRequestRow['status'],
        createdAt: r.createdAt.toISOString(),
      })
    ),
    grants: grantRows.map((g) => ({ ...g, createdAt: g.createdAt.toISOString() })),
  })
}

// hasConflictingActiveRequest(기존, PENDING/APPROVED만 걸러 비교)에 넘길 원본 목록이다.
// type='ADJUSTMENT'(관리자 수동 조정 기록, 실제 신청이 아님)만 제외하고 FULL/AM_HALF/PM_HALF는
// 전부 포함한다 — 반차도 기간 중복 검사 대상이다. type도 함께 내려줘야 오전/오후 반차처럼
// 같은 날짜라도 유형이 다르면 충돌로 보지 않는 판정이 가능하다.
export async function getOwnActiveRequestRanges(
  userId: number
): Promise<{ startDate: string; endDate: string; status: string; type: LeaveRequestType }[]> {
  return db
    .select({
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      status: leaveRequests.status,
      type: leaveRequests.type,
    })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.userId, userId), ne(leaveRequests.type, 'ADJUSTMENT')))
    .then((rows) => rows.map((r) => ({ ...r, type: r.type as LeaveRequestType })))
}

export interface LeaveRequestFields {
  title: string
  approverId: number
  startDate: string
  endDate: string
  type: 'FULL' | 'AM_HALF' | 'PM_HALF'
  requestedDays: number
  reason: string
}

export async function createLeaveRequest(
  userId: number,
  fields: LeaveRequestFields,
  status: 'DRAFT' | 'PENDING'
): Promise<{ id: number }> {
  const [row] = await db
    .insert(leaveRequests)
    .values({
      userId,
      approverId: fields.approverId,
      title: fields.title,
      startDate: fields.startDate,
      endDate: fields.endDate,
      type: fields.type,
      requestedDays: fields.requestedDays,
      reason: fields.reason,
      status,
      submittedAt: status === 'PENDING' ? new Date() : null,
    })
    .returning({ id: leaveRequests.id })
  return row
}

// DRAFT 상태 + 본인 소유일 때만 갱신한다. 조건에 안 맞으면(이미 제출됐거나 남의 문서) 아무 것도
// 갱신하지 않고 false를 반환한다 — 호출부가 404로 처리한다.
export async function updateDraftLeaveRequest(
  id: number,
  userId: number,
  fields: LeaveRequestFields
): Promise<boolean> {
  const rows = await db
    .update(leaveRequests)
    .set({
      title: fields.title,
      approverId: fields.approverId,
      startDate: fields.startDate,
      endDate: fields.endDate,
      type: fields.type,
      requestedDays: fields.requestedDays,
      reason: fields.reason,
    })
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'DRAFT')))
    .returning({ id: leaveRequests.id })
  return rows.length > 0
}

export async function deleteDraftLeaveRequest(id: number, userId: number): Promise<boolean> {
  const rows = await db
    .delete(leaveRequests)
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'DRAFT')))
    .returning({ id: leaveRequests.id })
  return rows.length > 0
}

export async function getOwnLeaveRequestById(id: number, userId: number) {
  const [row] = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.userId, userId)))
  return row ?? null
}

// applyTransition(기존 순수 함수)이 상태 전이 자체의 유효성(DRAFT→PENDING, PENDING→CANCELED 등)을
// 검증하고, 잘못된 전이면 Error를 던진다 — 호출부(API 라우트)가 그 Error를 잡아 400으로 응답한다.
export async function transitionOwnLeaveRequest(
  id: number,
  userId: number,
  action: 'SUBMIT' | 'CANCEL'
): Promise<{ status: LeaveRequestStatus } | null> {
  const row = await getOwnLeaveRequestById(id, userId)
  if (!row) return null
  const nextStatus = applyTransition(row.status as LeaveRequestStatus, action, 'REQUESTER')
  await db
    .update(leaveRequests)
    .set({
      status: nextStatus,
      submittedAt: action === 'SUBMIT' ? new Date() : row.submittedAt,
    })
    .where(eq(leaveRequests.id, id))
  return { status: nextStatus }
}

// POST(신규 제출)와 PATCH(기존 DRAFT 제출) 양쪽에서 재사용하는 제출 시점 검증 — 기간 충돌
// (같은 날짜에 연차나 같은 반차 유형이 이미 대기/승인 상태)만 차단(에러)한다. 잔여연차 초과는
// 더 이상 차단하지 않는다(2026-09-04 정책 변경 — 원 설계 문서 6장 갱신 안내 참고): 초과 여부는
// 클라이언트가 제출 전 확인 다이얼로그로 신청인에게 알리고, 최종 판단은 신청인/결재자에게
// 맡긴다. 오전 반차와 오후 반차처럼 같은 날짜라도 유형이 다르면 정상적으로 나눠 신청하는
// 조합이라 충돌로 보지 않는다(hasConflictingActiveRequest 참고).
export async function checkSubmissionEligibility(
  userId: number,
  startDate: string,
  endDate: string,
  type: LeaveRequestType,
  requestedDays: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (requestedDays === 0) {
    return { ok: false, error: '선택한 날짜는 주말/공휴일이라 신청할 수 없습니다.' }
  }
  const [me] = await db.select({ hireDate: users.hireDate }).from(users).where(eq(users.id, userId))
  if (!me?.hireDate) {
    return { ok: false, error: '입사일이 등록되지 않아 신청할 수 없습니다.' }
  }
  const today = new Date().toISOString().slice(0, 10)
  if (isBeyondBackdateLimit(startDate, today)) {
    return { ok: false, error: '신청 시작일이 오늘로부터 1개월보다 이전이라 제출할 수 없습니다. 결재자에게 문의해 주세요.' }
  }
  const existing = await getOwnActiveRequestRanges(userId)
  if (hasConflictingActiveRequest(existing, startDate, endDate, type)) {
    return { ok: false, error: '같은 기간에 이미 대기 중이거나 승인된 신청이 있어 제출할 수 없습니다.' }
  }
  return { ok: true }
}

export interface ApprovalQueueRow {
  id: number
  title: string
  startDate: string
  endDate: string
  type: 'FULL' | 'AM_HALF' | 'PM_HALF'
  requestedDays: number
  status: Exclude<LeaveRequestStatus, 'DRAFT'>
  reason: string
  rejectReason: string | null
  submittedAt: string | null
  requesterName: string
  // 승인 시점 기준 신청인의 현재 잔여연차(이 문서의 신청일수는 아직 반영 전 — PENDING은
  // getLeaveBalance의 사용량 집계에 포함되지 않는다). 결재자가 승인 확인 시 "승인하면
  // 마이너스가 되는지"를 판단할 수 있도록 PENDING 행에만 계산해 내려준다. 입사일이 없거나
  // PENDING이 아니면 null.
  requesterRemaining: number | null
}

// 본인이 결재자로 지정된 문서 전체를 반환한다. type='ADJUSTMENT'(관리자 수동 조정 기록)는
// 실제 결재 대상이 아니므로 제외한다. status='DRAFT'(아직 제출 전인 프리랜서 임시저장 문서)도
// 제외한다 — approverId는 제출 여부와 무관하게 항상 지정되므로, 그렇지 않으면 결재자에게
// 아직 제출되지 않은 문서가 노출된다. 대기 상태를 항상 먼저 보여주고 그다음 제출일 역순으로
// 정렬해, 처리해야 할 문서를 목록 상단에서 놓치지 않도록 한다.
export async function getApprovalQueue(approverId: number): Promise<ApprovalQueueRow[]> {
  const requester = alias(users, 'requester')
  const rows = await db
    .select({
      id: leaveRequests.id,
      title: leaveRequests.title,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      type: leaveRequests.type,
      requestedDays: leaveRequests.requestedDays,
      status: leaveRequests.status,
      reason: leaveRequests.reason,
      rejectReason: leaveRequests.rejectReason,
      submittedAt: leaveRequests.submittedAt,
      requesterId: requester.id,
      requesterName: requester.name,
      requesterHireDate: requester.hireDate,
    })
    .from(leaveRequests)
    .innerJoin(requester, eq(leaveRequests.userId, requester.id))
    .where(
      and(
        eq(leaveRequests.approverId, approverId),
        ne(leaveRequests.type, 'ADJUSTMENT'),
        ne(leaveRequests.status, 'DRAFT')
      )
    )

  const today = new Date().toISOString().slice(0, 10)
  // 같은 신청인의 대기 문서가 여러 건이어도 잔여연차 계산(DB 조회 포함)은 한 번만 하도록 캐시한다.
  const remainingByRequester = new Map<number, number>()

  const mapped: ApprovalQueueRow[] = []
  for (const r of rows) {
    let requesterRemaining: number | null = null
    if (r.status === 'PENDING' && r.requesterHireDate) {
      if (!remainingByRequester.has(r.requesterId)) {
        const balance = await getLeaveBalance(r.requesterId, r.requesterHireDate, today)
        remainingByRequester.set(r.requesterId, balance.remaining)
      }
      requesterRemaining = remainingByRequester.get(r.requesterId)!
    }
    mapped.push({
      id: r.id,
      title: r.title,
      startDate: r.startDate,
      endDate: r.endDate,
      type: r.type as ApprovalQueueRow['type'],
      requestedDays: r.requestedDays,
      status: r.status as Exclude<LeaveRequestStatus, 'DRAFT'>,
      reason: r.reason,
      rejectReason: r.rejectReason,
      submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
      requesterName: r.requesterName,
      requesterRemaining,
    })
  }

  return mapped
    .sort((a, b) => {
      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1
      if (a.status !== 'PENDING' && b.status === 'PENDING') return 1
      return (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '')
    })
}

export async function getLeaveRequestForApprover(id: number, approverId: number) {
  const [row] = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.approverId, approverId)))
  return row ?? null
}

// applyTransition(기존 순수 함수)이 상태 전이 자체의 유효성(PENDING→APPROVED/REJECTED만 허용)을
// 검증하고, 잘못된 전이면 Error를 던진다 — 호출부(API 라우트)가 그 Error를 잡아 400으로
// 응답한다. 반환값의 userId/title은 승인/반려 알림 생성 시 재조회 없이 바로 쓰기 위함이다.
export async function transitionLeaveRequestAsApprover(
  id: number,
  approverId: number,
  action: 'APPROVE' | 'REJECT',
  rejectReason?: string
): Promise<{ status: LeaveRequestStatus; userId: number; title: string } | null> {
  const row = await getLeaveRequestForApprover(id, approverId)
  if (!row) return null
  const nextStatus = applyTransition(row.status as LeaveRequestStatus, action, 'APPROVER')
  await db
    .update(leaveRequests)
    .set({
      status: nextStatus,
      processedAt: new Date(),
      rejectReason: action === 'REJECT' ? (rejectReason ?? null) : row.rejectReason,
    })
    .where(eq(leaveRequests.id, id))
  return { status: nextStatus, userId: row.userId, title: row.title }
}
