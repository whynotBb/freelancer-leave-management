import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireApprovedUser, toAuthErrorResponse } from '@/lib/auth/session'
import { isValidPassword, PASSWORD_POLICY_HINT } from '@/lib/domain/password-policy'

const bodySchema = z.object({
  password: z.string().refine(isValidPassword, { message: PASSWORD_POLICY_HINT }),
  currentPassword: z.string().min(1).optional(),
})

export async function POST(request: Request) {
  try {
    const session = await requireApprovedUser()
    const mustChangePassword = (session.user as { mustChangePassword?: boolean }).mustChangePassword
    const userId = Number((session.user as { id?: string }).id)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? PASSWORD_POLICY_HINT }, { status: 400 })
    }

    const [current] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId))
    if (!current) {
      return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 400 })
    }

    // 강제 초기화 대상(mustChangePassword=true)은 이미 임시 비밀번호로 인증된 세션이므로
    // 현재 비밀번호를 다시 물을 필요가 없다. 그 외(본인이 자발적으로 바꾸는 경우)에는 세션
    // 탈취만으로 비밀번호를 바꿔치기할 수 없도록 현재 비밀번호 확인을 요구한다.
    if (!mustChangePassword) {
      if (!parsed.data.currentPassword) {
        return NextResponse.json({ error: '현재 비밀번호를 입력해 주세요.' }, { status: 400 })
      }
      const matches = await bcrypt.compare(parsed.data.currentPassword, current.passwordHash)
      if (!matches) {
        return NextResponse.json({ error: '현재 비밀번호가 일치하지 않습니다.' }, { status: 400 })
      }
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
