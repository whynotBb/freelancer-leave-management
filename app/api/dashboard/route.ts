import { NextResponse } from 'next/server'
import { requireApprovedUser, toAuthErrorResponse } from '@/lib/auth/session'
import { getMyDocumentSummary } from '@/lib/db/leave-requests'
import {
  getActiveFreelancerCount,
  getApprovalCounts,
  getApproverCount,
  getAssignedFreelancerCount,
  getPendingRequestCountForRequester,
  getPendingSignupCount,
} from '@/lib/db/dashboard'

export async function GET() {
  try {
    const session = await requireApprovedUser()
    const userId = Number((session.user as { id?: string }).id)
    const role = (session.user as { role?: string }).role

    if (role === 'FREELANCER') {
      const [summary, pendingCount] = await Promise.all([
        getMyDocumentSummary(userId),
        getPendingRequestCountForRequester(userId),
      ])
      return NextResponse.json({
        role: 'FREELANCER',
        freelancer: {
          granted: summary.granted,
          used: summary.used,
          remaining: summary.remaining,
          pendingCount,
        },
      })
    }

    if (role === 'APPROVER') {
      const [counts, assignedFreelancerCount] = await Promise.all([
        getApprovalCounts(userId),
        getAssignedFreelancerCount(userId),
      ])
      return NextResponse.json({
        role: 'APPROVER',
        approver: {
          pendingCount: counts.pending,
          processedCount: counts.processed,
          assignedFreelancerCount,
        },
      })
    }

    // SUPER_ADMIN
    const [activeFreelancerCount, approverCount, pendingSignupCount, assignedFreelancerCount] = await Promise.all([
      getActiveFreelancerCount(),
      getApproverCount(),
      getPendingSignupCount(),
      getAssignedFreelancerCount(userId),
    ])
    let approver: { pendingCount: number; processedCount: number; assignedFreelancerCount: number } | null = null
    if (assignedFreelancerCount > 0) {
      const counts = await getApprovalCounts(userId)
      approver = { pendingCount: counts.pending, processedCount: counts.processed, assignedFreelancerCount }
    }
    return NextResponse.json({
      role: 'SUPER_ADMIN',
      admin: { activeFreelancerCount, approverCount, pendingSignupCount },
      approver,
    })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}
