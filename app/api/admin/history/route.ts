import { NextResponse } from 'next/server'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'
import { getSiteWideHistory } from '@/lib/db/history'
import type { HistoryEntry } from '@/lib/domain/user-history'

const TARGET_GROUPS = ['ACCOUNT', 'LEAVE', 'APPROVER', 'ATTENDANCE'] as const
type TargetGroup = (typeof TARGET_GROUPS)[number]

export async function GET(request: Request) {
  try {
    await requireSuperAdmin()
    const url = new URL(request.url)

    const targetGroupParam = url.searchParams.get('targetGroup')
    const targetGroup = (TARGET_GROUPS as readonly string[]).includes(targetGroupParam ?? '')
      ? (targetGroupParam as TargetGroup)
      : undefined

    const category = (url.searchParams.get('category') as HistoryEntry['category'] | null) ?? undefined
    const from = url.searchParams.get('from') ?? undefined
    const to = url.searchParams.get('to') ?? undefined
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? '50') || 50))

    const result = await getSiteWideHistory({ targetGroup, category, from, to, page, pageSize })
    return NextResponse.json(result)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
