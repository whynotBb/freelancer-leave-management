import { NextResponse } from 'next/server'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'
import { listDepartedUsers } from '@/lib/db/departures'

export async function GET() {
  try {
    await requireSuperAdmin()
    const list = await listDepartedUsers()
    return NextResponse.json(list)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
