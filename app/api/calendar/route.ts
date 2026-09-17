import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedUser, toAuthErrorResponse } from '@/lib/auth/session'
import { getCalendarData } from '@/lib/db/calendar'

export async function GET(req: NextRequest) {
  try {
    const session = await requireApprovedUser()
    const userId = Number((session.user as { id?: string }).id)
    const role = (session.user as { role?: string }).role ?? 'FREELANCER'

    const searchParams = req.nextUrl.searchParams
    const yearParam = Number(searchParams.get('year'))
    const monthParam = Number(searchParams.get('month'))
    const year = Number.isInteger(yearParam) && yearParam >= 1970 && yearParam <= 9999 ? yearParam : new Date().getFullYear()
    const month = Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12 ? monthParam : new Date().getMonth() + 1

    const data = await getCalendarData(userId, role, year, month)
    return NextResponse.json(data)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
