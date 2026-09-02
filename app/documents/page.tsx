'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { SearchIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/loading-spinner'
import { PageHeader } from '@/components/page-header'
import { LeaveRequestSheet, type MyRequestDocument } from '@/components/leave-request-sheet'

interface MyDocumentSummary {
  hireDate: string | null
  yearsOfService: number | null
  granted: number
  used: number
  remaining: number
  defaultApproverId: number | null
}

type TimelineEntry =
  | {
      kind: 'REQUEST'
      id: number
      date: string
      title: string
      startDate: string
      endDate: string
      type: 'FULL' | 'AM_HALF' | 'PM_HALF'
      requestedDays: number
      status: MyRequestDocument['status']
      reason: string
      approverId: number
      approverName: string | null
      rejectReason: string | null
    }
  | { kind: 'ADJUSTMENT'; date: string; detail: string; reason: string; actorName: string | null }

interface Approver {
  id: number
  name: string
  email: string
}

const TYPE_LABEL: Record<'FULL' | 'AM_HALF' | 'PM_HALF', string> = {
  FULL: '연차',
  AM_HALF: '오전 반차',
  PM_HALF: '오후 반차',
}

const STATUS_LABEL: Record<MyRequestDocument['status'], string> = {
  DRAFT: '임시저장',
  PENDING: '대기',
  APPROVED: '승인완료',
  REJECTED: '반려',
  CANCELED: '취소',
}

export default function DocumentsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const role = (session?.user as { role?: string } | undefined)?.role

  const [summary, setSummary] = useState<MyDocumentSummary | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [holidayDates, setHolidayDates] = useState<string[]>([])
  const [approvers, setApprovers] = useState<Approver[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<'create' | 'view'>('create')
  const [selectedDocument, setSelectedDocument] = useState<MyRequestDocument | null>(null)
  const [yearFilter, setYearFilter] = useState('all')
  const [titleSearch, setTitleSearch] = useState('')

  const yearOptions = useMemo(() => {
    const years = new Set(timeline.map((e) => e.date.slice(0, 4)))
    return [...years].sort((a, b) => (a < b ? 1 : -1))
  }, [timeline])

  const filteredTimeline = useMemo(() => {
    const query = titleSearch.toLowerCase()
    return timeline.filter((entry) => {
      if (yearFilter !== 'all' && entry.date.slice(0, 4) !== yearFilter) return false
      if (!query) return true
      const text = entry.kind === 'REQUEST' ? entry.title : entry.reason
      return text.toLowerCase().includes(query)
    })
  }, [timeline, yearFilter, titleSearch])

  useEffect(() => {
    if (session && role && role !== 'FREELANCER') {
      router.replace('/dashboard')
    }
  }, [session, role, router])

  function loadDocuments() {
    setLoading(true)
    fetch('/api/documents')
      .then((res) => {
        if (!res.ok) throw new Error('목록을 불러오지 못했습니다.')
        return res.json()
      })
      .then((data: { summary: MyDocumentSummary; timeline: TimelineEntry[]; holidayDates: string[] }) => {
        setSummary(data.summary)
        setTimeline(data.timeline)
        setHolidayDates(data.holidayDates)
      })
      .catch(() => setLoadError('목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadDocuments()
    fetch('/api/admin/approvers')
      .then((res) => res.json())
      .then(setApprovers)
  }, [])

  if (role && role !== 'FREELANCER') return null

  function openCreate() {
    setSheetMode('create')
    setSelectedDocument(null)
    setSheetOpen(true)
  }

  function openView(entry: TimelineEntry & { kind: 'REQUEST' }) {
    setSheetMode('view')
    setSelectedDocument({
      id: entry.id,
      title: entry.title,
      startDate: entry.startDate,
      endDate: entry.endDate,
      type: entry.type,
      requestedDays: entry.requestedDays,
      status: entry.status,
      reason: entry.reason,
      approverId: entry.approverId,
      approverName: entry.approverName,
      rejectReason: entry.rejectReason,
    })
    setSheetOpen(true)
  }

  return (
    <div className="w-full">
      <PageHeader
        title="내 문서"
        description="휴가현황과 연차 신청 내역을 확인하고 새 연차를 신청합니다."
        action={<Button onClick={openCreate}>+ 연차 신청</Button>}
      />

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : (
        <>
          <div className="mb-6 space-y-3 rounded-lg border p-4">
            <h2 className="font-medium">휴가현황</h2>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">입사일</p>
                <p>{summary?.hireDate ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">근속</p>
                <p>{summary?.yearsOfService ? `${summary.yearsOfService}년차` : '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">발생/사용</p>
                <p>{summary?.granted ?? 0}일 / {summary?.used ?? 0}일</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">잔여</p>
                <p>{summary?.remaining ?? 0}일</p>
              </div>
            </div>
          </div>

          <div className="mb-3 flex items-center justify-end gap-2">
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}년
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="제목 검색"
                value={titleSearch}
                onChange={(e) => setTitleSearch(e.target.value)}
                className="w-56 pl-8"
              />
            </div>
          </div>

          <div className="space-y-2">
            {filteredTimeline.length === 0 && <p className="text-sm text-muted-foreground">내역이 없습니다.</p>}
            {filteredTimeline.map((entry, index) =>
              entry.kind === 'REQUEST' ? (
                <button
                  key={`request-${entry.id}`}
                  type="button"
                  onClick={() => openView(entry)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-accent"
                >
                  <div>
                    <p className="font-medium">{entry.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {TYPE_LABEL[entry.type]} · {entry.startDate}
                      {entry.startDate !== entry.endDate ? ` ~ ${entry.endDate}` : ''} · {entry.requestedDays}일
                    </p>
                  </div>
                  <Badge variant="outline">{STATUS_LABEL[entry.status]}</Badge>
                </button>
              ) : (
                <div key={`adjustment-${index}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <div>
                    <p>{entry.reason}</p>
                    <p className="text-xs text-muted-foreground">{entry.date} · {entry.actorName ?? '-'}</p>
                  </div>
                  <span>{entry.detail}</span>
                </div>
              )
            )}
          </div>
        </>
      )}

      <LeaveRequestSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode={sheetMode}
        document={selectedDocument}
        requesterName={(session?.user as { name?: string } | undefined)?.name ?? ''}
        approvers={approvers}
        defaultApproverId={summary?.defaultApproverId ?? null}
        remaining={summary?.remaining ?? 0}
        holidayDates={holidayDates}
        onSaved={loadDocuments}
      />
    </div>
  )
}
