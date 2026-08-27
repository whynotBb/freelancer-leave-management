import { NextResponse } from 'next/server'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'
import { deleteDepartedUser } from '@/lib/db/departures'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin()
    const { id } = await params
    const result = await deleteDepartedUser(Number(id))
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
