'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingSpinner } from '@/components/loading-spinner'
import { PageHeader } from '@/components/page-header'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { HolidayFormDialog } from '@/components/holiday-form-dialog'

interface HolidayItem {
  id: number
  date: string
  name: string
  isRecurring: boolean
}

function monthDay(date: string): string {
  const [, month, day] = date.split('-')
  return `${month}/${day}`
}

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<HolidayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [yearFilter, setYearFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  function loadHolidays() {
    setLoading(true)
    setLoadError(null)
    fetch('/api/admin/holidays')
      .then((res) => {
        if (!res.ok) throw new Error('불러오지 못했습니다.')
        return res.json()
      })
      .then(setHolidays)
      .catch(() => setLoadError('공휴일 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadHolidays()
  }, [])

  const recurring = useMemo(
    () => [...holidays].filter((h) => h.isRecurring).sort((a, b) => monthDay(a.date).localeCompare(monthDay(b.date))),
    [holidays]
  )
  const oneTime = useMemo(() => holidays.filter((h) => !h.isRecurring), [holidays])
  const yearOptions = useMemo(() => {
    const years = new Set(oneTime.map((h) => h.date.slice(0, 4)))
    return [...years].sort((a, b) => (a < b ? 1 : -1))
  }, [oneTime])
  const filteredOneTime = useMemo(
    () =>
      oneTime
        .filter((h) => yearFilter === 'all' || h.date.slice(0, 4) === yearFilter)
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [oneTime, yearFilter]
  )
  const deleteTarget = holidays.find((h) => h.id === deleteTargetId) ?? null

  async function handleCreate(date: string, name: string, isRecurring: boolean) {
    setFormSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/admin/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, name, isRecurring }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setFormError(body?.error ?? '등록에 실패했습니다.')
        return
      }
      setFormOpen(false)
      loadHolidays()
    } finally {
      setFormSubmitting(false)
    }
  }

  async function handleDelete() {
    if (deleteTargetId === null) return
    setDeleteSubmitting(true)
    try {
      const res = await fetch(`/api/admin/holidays/${deleteTargetId}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteTargetId(null)
        loadHolidays()
      }
    } finally {
      setDeleteSubmitting(false)
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="공휴일 관리"
        description="연차 신청일수 계산에서 제외할 공휴일을 등록합니다. 주말은 자동으로 제외되어 별도 등록이 필요 없습니다."
        action={<Button onClick={() => setFormOpen(true)}>+ 공휴일 추가</Button>}
      />

      <p className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
        신정처럼 매년 같은 날짜인 공휴일은 &quot;매년 반복&quot;으로 등록하면 이후
        연도에도 자동 적용됩니다. 설날·추석처럼 음력 기준이라 매년 날짜가 바뀌는
        공휴일은 매년 새로 등록해야 합니다.
      </p>

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 font-medium">매년 반복 공휴일</h2>
            {recurring.length === 0 ? (
              <p className="text-sm text-muted-foreground">등록된 반복 공휴일이 없습니다.</p>
            ) : (
              <>
                <div className="hidden xl:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">월/일</TableHead>
                        <TableHead>이름</TableHead>
                        <TableHead className="w-24 text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recurring.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell>{monthDay(h.date)}</TableCell>
                          <TableCell>{h.name}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" className="text-destructive" onClick={() => setDeleteTargetId(h.id)}>
                              삭제
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-2 xl:hidden">
                  {recurring.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                      <div>
                        <Badge variant="outline" className="mr-2">
                          매년 반복
                        </Badge>
                        {monthDay(h.date)} · {h.name}
                      </div>
                      <Button variant="ghost" className="text-destructive" onClick={() => setDeleteTargetId(h.id)}>
                        삭제
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">특정 연도 공휴일</h2>
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
            </div>
            {filteredOneTime.length === 0 ? (
              <p className="text-sm text-muted-foreground">등록된 공휴일이 없습니다.</p>
            ) : (
              <>
                <div className="hidden xl:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-32">날짜</TableHead>
                        <TableHead>이름</TableHead>
                        <TableHead className="w-24 text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOneTime.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell>{h.date}</TableCell>
                          <TableCell>{h.name}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" className="text-destructive" onClick={() => setDeleteTargetId(h.id)}>
                              삭제
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-2 xl:hidden">
                  {filteredOneTime.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                      <div>
                        {h.date} · {h.name}
                      </div>
                      <Button variant="ghost" className="text-destructive" onClick={() => setDeleteTargetId(h.id)}>
                        삭제
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <HolidayFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onConfirm={handleCreate}
        submitting={formSubmitting}
        error={formError}
      />
      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
        title="공휴일 삭제"
        description={
          deleteTarget?.isRecurring
            ? '이 공휴일을 삭제하시겠습니까? 매년 반복 적용도 함께 삭제됩니다.'
            : '이 공휴일을 삭제하시겠습니까?'
        }
        confirmLabel="삭제"
        onConfirm={handleDelete}
        submitting={deleteSubmitting}
        destructive
      />
    </div>
  )
}
