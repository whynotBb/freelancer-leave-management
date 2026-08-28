import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { isValidPassword, PASSWORD_POLICY_HINT } from '@/lib/domain/password-policy'

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().refine(isValidPassword, { message: PASSWORD_POLICY_HINT }),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  const parsed = signupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  const [existing] = await db.select().from(users).where(eq(users.email, parsed.data.email))
  if (existing && existing.signupStatus !== 'REJECTED') {
    return NextResponse.json({ error: '이미 가입 신청된 이메일입니다.' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10)

  // 거절된 이메일의 재신청: 새 행을 만들지 않고(이메일 unique 제약) 기존 행을 새 신청
  // 정보로 갱신한다. 이전 승인 시 남았을 수 있는 입사일·기본 결재자·퇴사 이력도
  // 재신청 시점 기준으로 초기화한다.
  if (existing) {
    await db
      .update(users)
      .set({
        name: parsed.data.name,
        passwordHash,
        role: 'FREELANCER',
        signupStatus: 'PENDING',
        hireDate: null,
        defaultApproverId: null,
        resignedAt: null,
        resignReason: null,
        createdAt: new Date(),
      })
      .where(eq(users.id, existing.id))

    return NextResponse.json({ id: existing.id }, { status: 201 })
  }

  const [created] = await db
    .insert(users)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: 'FREELANCER',
      signupStatus: 'PENDING',
    })
    .returning({ id: users.id })

  return NextResponse.json({ id: created.id }, { status: 201 })
}
