import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

export async function requireApprovedUser() {
  const session = await auth()
  if (!session?.user) {
    throw new UnauthorizedError('로그인이 필요합니다.')
  }
  // JWT 세션은 서버에서 signupStatus가 바뀌어도 즉시 무효화되지 않으므로(NextAuth 기본
  // maxAge 30일), 매 요청마다 DB에서 현재 상태를 재확인해 퇴사/삭제된 계정의 기존 세션이
  // 계속 통과하지 않도록 막는다.
  const userId = Number((session.user as { id?: string }).id)
  const [current] = await db.select({ signupStatus: users.signupStatus }).from(users).where(eq(users.id, userId))
  if (!current || current.signupStatus !== 'APPROVED') {
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
