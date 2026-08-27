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
  if (existing) {
    return NextResponse.json({ error: '이미 가입 신청된 이메일입니다.' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10)
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
