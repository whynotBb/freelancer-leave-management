import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'
import { resignUser } from '@/lib/db/departures'

const bodySchema = z.object({
  reason: z.string().min(1),
  delegate: z.boolean().optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSuperAdmin()
    const callerId = Number((session.user as { id?: string }).id)
    const { id } = await params

    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }

    const result = await resignUser({
      userId: Number(id),
      reason: parsed.data.reason,
      delegateTo: parsed.data.delegate ? callerId : undefined,
    })

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') {
        return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
      }
      return NextResponse.json(
        { error: '대기 중인 결재 건이 있습니다.', pendingCount: result.pendingCount },
        { status: 409 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
