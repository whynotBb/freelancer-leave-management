'use client'

import { useEffect, useState } from 'react'
import { RotateCcwIcon, SearchIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/date-range-picker'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/loading-spinner'
import { PageHeader } from '@/components/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Category =
  | '가입 승인'
  | '가입 거절'
  | '퇴사'
  | '비밀번호 초기화'
  | '연차 자동 발생'
  | '연차 조정'
  | '입사일 변경'
  | '사용'
  | '결재자 변경'
  | '만근 예외'

type TargetGroup = 'ACCOUNT' | 'LEAVE' | 'APPROVER' | 'ATTENDANCE'

interface HistoryEntry {
  category: Category
  date: string
  detail: string
  reason: string
  actorName: string | null
  targetUserId?: number
  targetUserName?: string
}

interface HistoryPage {
  items: HistoryEntry[]
  total: number
  page: number
  pageSize: number
}

const CATEGORY_OPTIONS: Category[] = [
  '가입 승인',
  '가입 거절',
  '퇴사',
  '비밀번호 초기화',
  '연차 자동 발생',
  '연차 조정',
  '입사일 변경',
  '사용',
  '결재자 변경',
  '만근 예외',
]

const TARGET_GROUP_OPTIONS: { value: TargetGroup; label: string }[] = [
  { value: 'ACCOUNT', label: '계정' },
  { value: 'LEAVE', label: '연차' },
  { value: 'APPROVER', label: '결재자' },
  { value: 'ATTENDANCE', label: '만근 예외' },
]

const CATEGORY_BADGE_CLASS: Record<Category, string> = {
  '연차 자동 발생':
    'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  '연차 조정':
    'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  사용: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  '결재자 변경':
    'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300',
  '입사일 변경':
    'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300',
  '만근 예외':
    'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
  '가입 승인':
    'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300',
  '가입 거절':
    'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300',
  퇴사: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
  '비밀번호 초기화':
    'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
}

const PAGE_SIZE = 50

export default function AdminHistoryPage() {
  const [data, setData] = useState<HistoryPage>({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE })
  const [category, setCategory] = useState<Category | 'ALL'>('ALL')
  const [targetGroup, setTargetGroup] = useState<TargetGroup | 'ALL'>('ALL')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [targetName, setTargetName] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setLoadError(null)
    const params = new URLSearchParams()
    if (category !== 'ALL') params.set('category', category)
    if (targetGroup !== 'ALL') params.set('targetGroup', targetGroup)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (targetName) params.set('targetName', targetName)
    params.set('page', String(page))
    params.set('pageSize', String(PAGE_SIZE))

    fetch(`/api/admin/history?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error('목록을 불러오지 못했습니다.')
        return res.json()
      })
      .then(setData)
      .catch(() => setLoadError('목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false))
  }, [category, targetGroup, from, to, targetName, page])

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const hasActiveFilters = category !== 'ALL' || targetGroup !== 'ALL' || !!from || !!to || !!targetName

  function resetFilters() {
    setPage(1)
    setCategory('ALL')
    setTargetGroup('ALL')
    setFrom('')
    setTo('')
    setTargetName('')
  }

  return (
    <div className="w-full">
      <PageHeader title="변경 이력" description="가입 승인/거절, 퇴사, 비밀번호 초기화, 연차, 결재자, 만근 예외 변경 이력을 조회합니다." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={category}
          onValueChange={(value) => {
            setPage(1)
            setCategory(value as Category | 'ALL')
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="전체 작업" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 작업</SelectItem>
            {CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={targetGroup}
          onValueChange={(value) => {
            setPage(1)
            setTargetGroup(value as TargetGroup | 'ALL')
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="전체 대상" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 대상</SelectItem>
            {TARGET_GROUP_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DateRangePicker
          value={{ from: from || undefined, to: to || undefined }}
          onChange={(range) => {
            setPage(1)
            setFrom(range.from ?? '')
            setTo(range.to ?? '')
          }}
          placeholder="기간 선택"
          className="w-56"
        />

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="대상 이름 검색"
            value={targetName}
            onChange={(e) => {
              setPage(1)
              setTargetName(e.target.value)
            }}
            className="w-48 pl-8"
          />
        </div>

        <Button variant="outline" disabled={!hasActiveFilters} onClick={resetFilters}>
          <RotateCcwIcon className="size-4" />
          초기화
        </Button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">표시할 이력이 없습니다.</p>
      ) : (
        <>
          <Table className="hidden lg:table" containerClassName="hidden lg:block">
            <TableHeader>
              <TableRow>
                <TableHead>일시</TableHead>
                <TableHead>작업자</TableHead>
                <TableHead>작업</TableHead>
                <TableHead>대상</TableHead>
                <TableHead>내용</TableHead>
                <TableHead>사유</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((entry, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{entry.date}</TableCell>
                  <TableCell>{entry.actorName ?? '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={CATEGORY_BADGE_CLASS[entry.category]}>
                      {entry.category}
                    </Badge>
                  </TableCell>
                  <TableCell>{entry.targetUserName ?? '-'}</TableCell>
                  <TableCell>{entry.detail}</TableCell>
                  <TableCell className="text-muted-foreground">{entry.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 lg:hidden">
            {data.items.map((entry, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-4 text-sm">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={CATEGORY_BADGE_CLASS[entry.category]}>
                    {entry.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{entry.date}</span>
                </div>
                <p className="font-medium">{entry.targetUserName ?? '-'}</p>
                <p>{entry.detail}</p>
                <p className="text-xs text-muted-foreground">
                  사유: {entry.reason}
                  {entry.actorName && ` · 작업자: ${entry.actorName}`}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              이전
            </Button>
            <span className="text-sm text-muted-foreground">
              페이지 {data.page} / {totalPages}
            </span>
            <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              다음
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
