import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'

const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  role: z.enum(['FREELANCER', 'APPROVER']).optional(),
  hireDate: z.string().optional(),
  defaultApproverId: z.number().optional(),
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
    const parsed = decisionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }

    if (parsed.data.decision === 'APPROVED') {
      if (!parsed.data.role) {
        return NextResponse.json({ error: '승인 시 권한(프리랜서/결재담당자)을 선택해야 합니다.' }, { status: 400 })
      }
      if (parsed.data.role === 'FREELANCER' && !parsed.data.hireDate) {
        return NextResponse.json({ error: '프리랜서 승인 시 입사일은 필수입니다.' }, { status: 400 })
      }
    }

    const isFreelancer = parsed.data.role === 'FREELANCER'
    await db
      .update(users)
      .set({
        signupStatus: parsed.data.decision,
        role: parsed.data.role,
        hireDate: isFreelancer ? parsed.data.hireDate : null,
        defaultApproverId: isFreelancer ? parsed.data.defaultApproverId : null,
      })
      .where(eq(users.id, Number(id)))

    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
