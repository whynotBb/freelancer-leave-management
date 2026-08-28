import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { ForbiddenError, requireApprovedUser, toAuthErrorResponse } from '@/lib/auth/session'
import { isValidPassword, PASSWORD_POLICY_HINT } from '@/lib/domain/password-policy'

const bodySchema = z.object({
  password: z.string().refine(isValidPassword, { message: PASSWORD_POLICY_HINT }),
})

export async function POST(request: Request) {
  try {
    const session = await requireApprovedUser()
    // 이 엔드포인트는 관리자 강제 초기화 플로우의 종착점으로만 존재한다(스펙에서
    // 일반적인 자기서비스 비밀번호 변경은 범위 밖으로 명시) — 강제 대상이 아닌
    // 세션에서의 호출은 거부한다.
    if (!(session.user as { mustChangePassword?: boolean }).mustChangePassword) {
      throw new ForbiddenError('비밀번호 변경이 필요한 계정이 아닙니다.')
    }
    const userId = Number((session.user as { id?: string }).id)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: PASSWORD_POLICY_HINT }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10)
    await db
      .update(users)
      .set({ passwordHash, mustChangePassword: false, passwordChangedAt: new Date() })
      .where(eq(users.id, userId))

    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
