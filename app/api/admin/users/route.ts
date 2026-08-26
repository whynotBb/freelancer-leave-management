import { NextResponse } from 'next/server'
import { requireApproverOrAbove, toAuthErrorResponse } from '@/lib/auth/session'
import { getApprovedFreelancers } from '@/lib/db/freelancers'

export async function GET() {
  try {
    const session = await requireApproverOrAbove()
    const role = (session.user as { role?: string }).role
    const callerId = Number((session.user as { id?: string }).id)

    const freelancers = await getApprovedFreelancers()
    const result = freelancers.map((u) => ({
      ...u,
      canEdit: role === 'SUPER_ADMIN' || u.defaultApproverId === callerId,
    }))
    return NextResponse.json(result)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
