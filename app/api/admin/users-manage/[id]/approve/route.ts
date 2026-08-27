import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'

const bodySchema = z.object({
  role: z.enum(['FREELANCER', 'APPROVER']),
  hireDate: z.string().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin()
    const { id } = await params

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    if (parsed.data.role === 'FREELANCER' && !parsed.data.hireDate) {
      return NextResponse.json({ error: '프리랜서 승인 시 입사일은 필수입니다.' }, { status: 400 })
    }

    const isFreelancer = parsed.data.role === 'FREELANCER'
    await db
      .update(users)
      .set({
        signupStatus: 'APPROVED',
        role: parsed.data.role,
        hireDate: isFreelancer ? parsed.data.hireDate : null,
      })
      .where(eq(users.id, Number(id)))

    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
