import type { ExportMode } from '@/lib/domain/user-export'
import { getApprovedFreelancers, type FreelancerSummary } from './freelancers'

export async function getUsersForExport(params: {
  mode: ExportMode
  ids?: number[]
  callerId: number
}): Promise<FreelancerSummary[]> {
  const all = await getApprovedFreelancers()
  if (params.mode === 'mine') {
    return all.filter((u) => u.defaultApproverId === params.callerId)
  }
  if (params.mode === 'selected') {
    const idSet = new Set(params.ids ?? [])
    return all.filter((u) => idSet.has(u.id))
  }
  return all
}
