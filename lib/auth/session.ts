import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

export async function requireApprovedUser() {
  const session = await auth()
  if (!session?.user) {
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
