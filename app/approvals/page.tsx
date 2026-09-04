'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { SearchIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
}

const TYPE_LABEL: Record<'FULL' | 'AM_HALF' | 'PM_HALF', string> = {
  FULL: '연차',
  AM_HALF: '오전 반차',
  PM_HALF: '오후 반차',
}

type StatusFilter = 'PENDING' | 'DONE' | 'ALL'
const DONE_STATUSES = new Set(['APPROVED', 'REJECTED', 'CANCELED'])

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
      if (statusFilter === 'PENDING' && row.status !== 'PENDING') return false
      if (statusFilter === 'DONE' && !DONE_STATUSES.has(row.status)) return false
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
          <div className="mb-3 flex items-center justify-end gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">대기</SelectItem>
                <SelectItem value="DONE">처리완료</SelectItem>
                <SelectItem value="ALL">전체</SelectItem>
              </SelectContent>
            </Select>
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
