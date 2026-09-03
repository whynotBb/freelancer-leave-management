import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'
import { createHolidays, listHolidays } from '@/lib/db/holidays'

export async function GET() {
  try {
    await requireSuperAdmin()
    const list = await listHolidays()
    return NextResponse.json(list)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const bodySchema = z
  .object({
    startDate: z.string().regex(DATE_REGEX, '날짜 형식이 올바르지 않습니다.'),
    endDate: z.string().regex(DATE_REGEX, '날짜 형식이 올바르지 않습니다.'),
    name: z.string().trim().min(1).max(100),
    isRecurring: z.boolean(),
  })
  .refine((body) => body.startDate <= body.endDate, {
    message: '종료일이 시작일보다 이릅니다.',
    path: ['endDate'],
  })

export async function POST(request: Request) {
  try {
    await requireSuperAdmin()

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

    const result = await createHolidays(parsed.data)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
