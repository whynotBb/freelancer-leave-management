import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

// JWT 세션은 서버에서 signupStatus가 바뀌어도 즉시 무효화되지 않으므로(NextAuth 기본
// maxAge 30일), 퇴사/삭제된 계정의 기존 세션이 계속 통과하지 않도록 DB에서 현재 상태를
// 재확인한다. 다만 매 요청마다 재확인하면 관리자 API 전체가 DB 왕복 1회를 추가로 물게 되어
// 체감 지연이 커지므로, 인스턴스 메모리에 최근 확인 결과를 5분간 캐시해 그 안에서는 재조회를
// 건너뛴다. Vercel 서버리스 특성상 함수 인스턴스가 재활용되지 않으면(콜드 스타트) 캐시가
// 비어 있어 그때는 다시 DB를 조회하므로, 상태 반영이 완전히 즉시는 아니지만(최대 5분 지연)
// 안전하게 완화된다.
const STATUS_CHECK_INTERVAL_MS = 5 * 60 * 1000
const statusCache = new Map<number, { approved: boolean; checkedAt: number }>()

export async function requireApprovedUser() {
  const session = await auth()
  if (!session?.user) {
    throw new UnauthorizedError('로그인이 필요합니다.')
  }
  const userId = Number((session.user as { id?: string }).id)

  const cached = statusCache.get(userId)
  const now = Date.now()
  if (cached && now - cached.checkedAt < STATUS_CHECK_INTERVAL_MS) {
    if (!cached.approved) {
      throw new UnauthorizedError('로그인이 필요합니다.')
    }
    return session
  }

  const [current] = await db.select({ signupStatus: users.signupStatus }).from(users).where(eq(users.id, userId))
  const approved = !!current && current.signupStatus === 'APPROVED'
  statusCache.set(userId, { approved, checkedAt: now })

  if (!approved) {
    throw new UnauthorizedError('로그인이 필요합니다.')
  }
  return session
}

export async function requireSuperAdmin() {
  const session = await requireApprovedUser()
  if ((session.user as { role?: string }).role !== 'SUPER_ADMIN') {
    throw new ForbiddenError('최고관리자만 접근할 수 있습니다.')
  }
  return session
}

export async function requireApproverOrAbove() {
  const session = await requireApprovedUser()
  const role = (session.user as { role?: string }).role
  if (role !== 'SUPER_ADMIN' && role !== 'APPROVER') {
    throw new ForbiddenError('결재자 또는 최고관리자만 접근할 수 있습니다.')
  }
  return session
}

export function toAuthErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }
  return null
}
