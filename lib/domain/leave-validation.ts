export interface ExistingRequestRange {
  startDate: string
  endDate: string
  status: string
}

const ACTIVE_STATUSES = new Set(['PENDING', 'APPROVED'])

export function hasOverlappingActiveRequest(
  existing: ExistingRequestRange[],
  startDate: string,
  endDate: string
): boolean {
  return existing
    .filter((r) => ACTIVE_STATUSES.has(r.status))
    .some((r) => r.startDate <= endDate && startDate <= r.endDate)
}
