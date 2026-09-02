import { describe, expect, it } from 'vitest'
import { buildMyDocumentTimeline } from './my-document-timeline'

describe('buildMyDocumentTimeline', () => {
  it('일반 신청 문서는 상태를 포함한 REQUEST 항목으로 매핑한다', () => {
    const result = buildMyDocumentTimeline({
      requests: [
        {
          id: 1,
          title: '여름 휴가',
          startDate: '2026-08-14',
          endDate: '2026-08-14',
          type: 'FULL',
          requestedDays: 1,
          status: 'PENDING',
          reason: '개인 사정',
          approverId: 3,
          approverName: '김결재',
          rejectReason: null,
          createdAt: '2026-08-13T01:00:00.000Z',
        },
      ],
      grants: [],
    })
    expect(result).toEqual([
      {
        kind: 'REQUEST',
        id: 1,
        date: '2026-08-13 10:00',
        title: '여름 휴가',
        startDate: '2026-08-14',
        endDate: '2026-08-14',
        type: 'FULL',
        requestedDays: 1,
        status: 'PENDING',
        reason: '개인 사정',
        approverId: 3,
        approverName: '김결재',
        rejectReason: null,
      },
    ])
  })

  it('type이 ADJUSTMENT인 신청 문서는 신청서가 아니라 조정 항목으로 매핑한다(상태 배지 없음)', () => {
    const result = buildMyDocumentTimeline({
      requests: [
        {
          id: 2,
          title: '연차 사용 수동 조정',
          startDate: '2026-07-01',
          endDate: '2026-07-01',
          type: 'ADJUSTMENT',
          requestedDays: -1,
          status: 'APPROVED',
          reason: '중복 신청 취소 보정',
          approverId: 9,
          approverName: '관리자',
          rejectReason: null,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      grants: [],
    })
    expect(result).toEqual([
      {
        kind: 'ADJUSTMENT',
        date: '2026-07-01 09:00',
        detail: '-1일',
        reason: '중복 신청 취소 보정',
        actorName: '관리자',
      },
    ])
  })

  it('연차 발생/조정 내역(leaveGrants)도 ADJUSTMENT 항목으로 매핑하고, 자동 발생은 처리자를 시스템으로 표시한다', () => {
    const result = buildMyDocumentTimeline({
      requests: [],
      grants: [
        {
          amount: 1,
          note: null,
          createdBy: null,
          createdByName: null,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    })
    expect(result).toEqual([
      {
        kind: 'ADJUSTMENT',
        date: '2026-04-01 09:00',
        detail: '+1일',
        reason: '-',
        actorName: '시스템',
      },
    ])
  })

  it('신청 문서와 발생/조정 내역을 날짜 내림차순으로 병합한다', () => {
    const result = buildMyDocumentTimeline({
      requests: [
        {
          id: 1,
          title: '오래된 신청',
          startDate: '2026-02-01',
          endDate: '2026-02-01',
          type: 'FULL',
          requestedDays: 1,
          status: 'APPROVED',
          reason: '-',
          approverId: 3,
          approverName: '김결재',
          rejectReason: null,
          createdAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      grants: [
        {
          amount: 1,
          note: null,
          createdBy: null,
          createdByName: null,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    })
    expect(result.map((e) => e.date)).toEqual(['2026-04-01 09:00', '2026-02-01 09:00'])
  })
})
