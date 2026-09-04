'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingSpinner } from '@/components/loading-spinner'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { ApprovalRequestSheet, type ApprovalDocument } from '@/components/approval-request-sheet'

interface ApprovalRow {
  id: number
  title: string
  startDate: string
  endDate: string
  type: 'FULL' | 'AM_HALF' | 'PM_HALF'
  requestedDays: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED'
  reason: string
  rejectReason: string | null
  submittedAt: string | null
  requesterName: string
  requesterRemaining: number | null
}

const TYPE_LABEL: Record<'FULL' | 'AM_HALF' | 'PM_HALF', string> = {
  FULL: '연차',
  AM_HALF: '오전 반차',
  PM_HALF: '오후 반차',
}

type StatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'

// CANCELED(신청인이 직접 취소)는 이 네 탭 중 어디에도 값으로 없다 — '전체' 탭(필터링 없음)에서만
// 자연히 보이고, 나머지 세 탭은 status 값을 그대로 비교하므로 CANCELED 문서는 걸러진다.
const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'PENDING', label: '승인대기' },
  { value: 'APPROVED', label: '승인완료' },
  { value: 'REJECTED', label: '승인거절' },
]

export default function ApprovalsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const role = (session?.user as { role?: string } | undefined)?.role

  const [rows, setRows] = useState<ApprovalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING')
  const [nameSearch, setNameSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selected, setSelected] = useState<ApprovalDocument | null>(null)

  useEffect(() => {
    if (session && role && role !== 'SUPER_ADMIN' && role !== 'APPROVER') {
      router.replace('/dashboard')
    }
  }, [session, role, router])

  function loadQueue() {
    setLoading(true)
    setLoadError(null)
    fetch('/api/approvals')
      .then((res) => {
        if (!res.ok) throw new Error('목록을 불러오지 못했습니다.')
        return res.json()
      })
      .then((data: ApprovalRow[]) => setRows(data))
      .catch(() => setLoadError('목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadQueue()
  }, [])

  const filteredRows = useMemo(() => {
    const query = nameSearch.toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false
      if (!query) return true
      return row.requesterName.toLowerCase().includes(query)
    })
  }, [rows, statusFilter, nameSearch])

  if (role && role !== 'SUPER_ADMIN' && role !== 'APPROVER') return null

  function openDetail(row: ApprovalRow) {
    setSelected({
      id: row.id,
      title: row.title,
      requesterName: row.requesterName,
      startDate: row.startDate,
      endDate: row.endDate,
      type: row.type,
      requestedDays: row.requestedDays,
      status: row.status,
      reason: row.reason,
      rejectReason: row.rejectReason,
      requesterRemaining: row.requesterRemaining,
    })
    setSheetOpen(true)
  }

  return (
    <div className="w-full">
      <PageHeader title="결재함" description="내가 결재자로 지정된 휴가계를 확인하고 승인/반려 처리합니다." />

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-md border p-1">
              {STATUS_TABS.map((tab) => (
                <Button
                  key={tab.value}
                  type="button"
                  size="sm"
                  variant={statusFilter === tab.value ? 'default' : 'ghost'}
                  onClick={() => setStatusFilter(tab.value)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="신청인 검색"
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                className="w-56 pl-8"
              />
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">내역이 없습니다.</p>
          ) : (
            <>
              <div className="hidden xl:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>제출일</TableHead>
                      <TableHead>신청인</TableHead>
                      <TableHead>제목</TableHead>
                      <TableHead>기간·유형</TableHead>
                      <TableHead className="w-20">일수</TableHead>
                      <TableHead className="w-24">상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => (
                      <TableRow key={row.id} className="cursor-pointer" onClick={() => openDetail(row)}>
                        <TableCell className="text-muted-foreground">
                          {row.submittedAt ? row.submittedAt.slice(0, 10) : '-'}
                        </TableCell>
                        <TableCell>{row.requesterName}</TableCell>
                        <TableCell className="font-medium">{row.title}</TableCell>
                        <TableCell>
                          {TYPE_LABEL[row.type]} · {row.startDate}
                          {row.startDate !== row.endDate ? ` ~ ${row.endDate}` : ''}
                        </TableCell>
                        <TableCell>{row.requestedDays}일</TableCell>
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 xl:hidden">
                {filteredRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => openDetail(row)}
                    className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left text-sm hover:bg-accent"
                  >
                    <div>
                      <p className="font-medium">{row.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.requesterName} · {TYPE_LABEL[row.type]} · {row.startDate}
                        {row.startDate !== row.endDate ? ` ~ ${row.endDate}` : ''} · {row.requestedDays}일
                      </p>
                    </div>
                    <StatusBadge status={row.status} />
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <ApprovalRequestSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        document={selected}
        onProcessed={loadQueue}
      />
    </div>
  )
}
