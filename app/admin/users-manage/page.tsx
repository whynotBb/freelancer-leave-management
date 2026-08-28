'use client'

import { useEffect, useMemo, useState } from 'react'
import { SearchIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/date-picker'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/loading-spinner'
import { PageHeader } from '@/components/page-header'
import { ResignDialog } from '@/components/resign-dialog'
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

interface ManagedUser {
  id: number
  name: string
  email: string
  role: 'SUPER_ADMIN' | 'APPROVER' | 'FREELANCER'
  signupStatus: 'PENDING' | 'APPROVED'
  hireDate: string | null
  createdAt: string
}

type PendingRole = 'FREELANCER' | 'APPROVER'
type Tab = 'all' | 'pending'

const ROLE_LABEL: Record<ManagedUser['role'], string> = {
  SUPER_ADMIN: '최고관리자',
  APPROVER: '결재자',
  FREELANCER: '프리랜서',
}

const ROLE_BADGE_CLASS: Record<ManagedUser['role'], string> = {
  SUPER_ADMIN:
    'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
  APPROVER:
    'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  FREELANCER:
    'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300',
}

const STATUS_LABEL: Record<ManagedUser['signupStatus'], string> = {
  PENDING: '승인대기',
  APPROVED: '활성',
}

const STATUS_BADGE_CLASS: Record<ManagedUser['signupStatus'], string> = {
  PENDING:
    'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  APPROVED:
    'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
}

export default function AdminUsersManagePage() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [tab, setTab] = useState<Tab>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingRoles, setPendingRoles] = useState<Record<number, PendingRole>>({})
  const [pendingHireDates, setPendingHireDates] = useState<Record<number, string>>({})
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [decidingId, setDecidingId] = useState<number | null>(null)
  const [resignTarget, setResignTarget] = useState<{ id: number; name: string } | null>(null)
  const [search, setSearch] = useState('')

  function load() {
    setLoading(true)
    fetch('/api/admin/users-manage')
      .then((res) => {
        if (!res.ok) throw new Error('목록을 불러오지 못했습니다.')
        return res.json()
      })
      .then(setUsers)
      .catch(() => setLoadError('목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [])

  const pendingCount = users.filter((u) => u.signupStatus === 'PENDING').length
  const visible = useMemo(() => {
    const query = search.toLowerCase()
    return users
      .filter((u) => (tab === 'pending' ? u.signupStatus === 'PENDING' : true))
      .filter((u) => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query))
  }, [users, tab, search])

  function getPendingRole(id: number): PendingRole {
    return pendingRoles[id] ?? 'FREELANCER'
  }

  async function decide(user: ManagedUser, decision: 'approve' | 'reject') {
    setDecidingId(user.id)
    const role = getPendingRole(user.id)
    const hireDate = pendingHireDates[user.id]
    const body = decision === 'approve' ? { role, hireDate: role === 'FREELANCER' ? hireDate : undefined } : {}
    try {
      const res = await fetch(`/api/admin/users-manage/${user.id}/${decision}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setRowErrors((prev) => ({ ...prev, [user.id]: data?.error ?? '처리에 실패했습니다.' }))
        return
      }
      setRowErrors((prev) => {
        const next = { ...prev }
        delete next[user.id]
        return next
      })
      load()
    } finally {
      setDecidingId(null)
    }
  }

  function renderPendingFields(user: ManagedUser, layout: 'row' | 'stack') {
    const role = getPendingRole(user.id)
    const wrapClass = layout === 'row' ? 'flex items-center gap-2' : 'space-y-1'
    return (
      <div className={wrapClass}>
        {layout === 'stack' && <p className="text-xs text-muted-foreground">권한</p>}
        <Select
          value={role}
          onValueChange={(value) => setPendingRoles((prev) => ({ ...prev, [user.id]: value as PendingRole }))}
        >
          <SelectTrigger className={layout === 'row' ? 'w-32' : 'w-full'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FREELANCER">프리랜서</SelectItem>
            <SelectItem value="APPROVER">결재자</SelectItem>
          </SelectContent>
        </Select>
        {role === 'FREELANCER' && (
          <div className={layout === 'stack' ? 'space-y-1' : undefined}>
            {layout === 'stack' && <p className="text-xs text-muted-foreground">입사일</p>}
            <DatePicker
              value={pendingHireDates[user.id]}
              onChange={(value) => setPendingHireDates((prev) => ({ ...prev, [user.id]: value }))}
              placeholder="입사일 선택"
              className={layout === 'stack' ? 'w-full' : 'w-40'}
            />
          </div>
        )}
      </div>
    )
  }

  function renderActions(user: ManagedUser, layout: 'row' | 'stack') {
    const wrapClass = layout === 'row' ? 'flex items-center justify-end gap-2' : 'flex gap-2'
    const btnClass = layout === 'stack' ? 'flex-1' : undefined
    if (user.signupStatus === 'PENDING') {
      return (
        <div className={wrapClass}>
          <Button className={btnClass} disabled={decidingId === user.id} onClick={() => decide(user, 'approve')}>
            승인
          </Button>
          <Button
            className={btnClass}
            variant="outline"
            disabled={decidingId === user.id}
            onClick={() => decide(user, 'reject')}
          >
            거절
          </Button>
        </div>
      )
    }
    return (
      <div className={wrapClass}>
        <Button className={btnClass} variant="outline" disabled>
          비밀번호 초기화
        </Button>
        {user.role !== 'SUPER_ADMIN' && (
          <Button
            className={btnClass}
            variant="destructive"
            onClick={() => setResignTarget({ id: user.id, name: user.name })}
          >
            퇴사
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="w-full">
      <PageHeader title="사용자 관리" description="가입 승인, 권한, 퇴사 처리를 한 화면에서 관리합니다." />

      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant={tab === 'all' ? 'default' : 'outline'} onClick={() => setTab('all')}>
            전체 {users.length}
          </Button>
          <Button variant={tab === 'pending' ? 'default' : 'outline'} onClick={() => setTab('pending')}>
            승인대기 {pendingCount}
          </Button>
        </div>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="이름/이메일 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 pl-8"
          />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {search
            ? `'${search}' 검색 결과가 없습니다.`
            : tab === 'pending'
              ? '승인 대기 중인 사용자가 없습니다.'
              : '표시할 사용자가 없습니다.'}
        </p>
      ) : (
        <>
          <Table className="hidden lg:table" containerClassName="hidden lg:block">
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>권한</TableHead>
                <TableHead>입사일</TableHead>
                <TableHead>가입일</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    {user.signupStatus === 'PENDING' ? (
                      renderPendingFields(user, 'row')
                    ) : (
                      <Badge variant="outline" className={ROLE_BADGE_CLASS[user.role]}>
                        {ROLE_LABEL[user.role]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.role === 'FREELANCER' ? (user.hireDate ?? '-') : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.createdAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_BADGE_CLASS[user.signupStatus]}>
                      {STATUS_LABEL[user.signupStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {renderActions(user, 'row')}
                    {rowErrors[user.id] && (
                      <p className="mt-1 text-right text-sm text-destructive">{rowErrors[user.id]}</p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {visible.map((user) => (
              <div key={user.id} className="space-y-3 rounded-lg border p-4">
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex items-center justify-between">
                  {user.signupStatus === 'PENDING' ? (
                    renderPendingFields(user, 'stack')
                  ) : (
                    <Badge variant="outline" className={ROLE_BADGE_CLASS[user.role]}>
                      {ROLE_LABEL[user.role]}
                    </Badge>
                  )}
                  <Badge variant="outline" className={STATUS_BADGE_CLASS[user.signupStatus]}>
                    {STATUS_LABEL[user.signupStatus]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  입사일: {user.role === 'FREELANCER' ? (user.hireDate ?? '-') : '-'} · 가입일: {user.createdAt.slice(0, 10)}
                </p>
                {renderActions(user, 'stack')}
                {rowErrors[user.id] && <p className="text-sm text-destructive">{rowErrors[user.id]}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      <ResignDialog
        open={resignTarget !== null}
        onOpenChange={(open) => !open && setResignTarget(null)}
        userId={resignTarget?.id ?? null}
        userName={resignTarget?.name ?? ''}
      />
    </div>
  )
}
