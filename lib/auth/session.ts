import { auth } from '@/lib/auth'

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

export async function requireApprovedUser() {
  const session = await auth()
  if (!session?.user) {
    throw new UnauthorizedError('로그인이 필요합니다.')
  }
  return session
}

export async function requireAdmin() {
  const session = await requireApprovedUser()
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    throw new ForbiddenError('관리자만 접근할 수 있습니다.')
  }
  return session
}
