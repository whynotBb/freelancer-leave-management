export type LeaveRequestStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED'
export type LeaveWorkflowAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL'
export type Actor = 'REQUESTER' | 'APPROVER' | 'ADMIN'

const TRANSITIONS: Record<LeaveRequestStatus, Partial<Record<LeaveWorkflowAction, LeaveRequestStatus>>> = {
  DRAFT: { SUBMIT: 'PENDING' },
  PENDING: { APPROVE: 'APPROVED', REJECT: 'REJECTED', CANCEL: 'CANCELED' },
  APPROVED: { CANCEL: 'CANCELED' },
  REJECTED: {},
  CANCELED: {},
}

const ALLOWED_ACTORS: Record<LeaveWorkflowAction, Actor[]> = {
  SUBMIT: ['REQUESTER'],
  APPROVE: ['APPROVER'],
  REJECT: ['APPROVER'],
  CANCEL: ['REQUESTER', 'ADMIN'],
}

export function applyTransition(
  currentStatus: LeaveRequestStatus,
  action: LeaveWorkflowAction,
  actor: Actor
): LeaveRequestStatus {
  const nextStatus = TRANSITIONS[currentStatus]?.[action]
  if (!nextStatus) {
    throw new Error(`${currentStatus} 상태에서는 ${action}을 수행할 수 없습니다.`)
  }
  if (!ALLOWED_ACTORS[action].includes(actor)) {
    throw new Error(`${actor}는 ${action}을 수행할 권한이 없습니다.`)
  }
  if (action === 'CANCEL' && currentStatus === 'PENDING' && actor !== 'REQUESTER') {
    throw new Error('대기 상태의 취소는 신청인만 가능합니다.')
  }
  if (action === 'CANCEL' && currentStatus === 'APPROVED' && actor !== 'ADMIN') {
    throw new Error('승인된 문서의 취소는 관리자만 가능합니다.')
  }
  return nextStatus
}
