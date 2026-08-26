'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/date-picker'
import { ApproverCombobox } from '@/components/approver-combobox'
import { LeaveAdjustmentDialog } from '@/components/leave-adjustment-dialog'
import { PageHeader } from '@/components/page-header'
import { UserHistoryPanel } from '@/components/user-history-panel'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface FreelancerUser {
  id: number
  name: string
  email: string
  hireDate: string | null
  defaultApproverId: number | null
  defaultApproverName: string | null
  granted: number
  used: number
  remaining: number
  canEdit: boolean
}

interface Approver {
  id: number
  name: string
  email: string
}

interface Draft {
  hireDate: string
  grantedTotal: string
  usedTotal: string
}

type PendingSave =
  | { kind: 'fields'; userId: number }
  | { kind: 'approver'; userId: number; approverId: number }

function toDraft(user: FreelancerUser): Draft {
  return {
    hireDate: user.hireDate ?? '',
    grantedTotal: String(user.granted),
    usedTotal: String(user.used),
  }
}

export default function AdminUsersPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const callerId = Number((session?.user as { id?: string } | undefined)?.id)

  const [users, setUsers] = useState<FreelancerUser[]>([])
  const [approvers, setApprovers] = useState<Approver[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [search, setSearch] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [historyUserId, setHistoryUserId] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/admin/users')
      .then((res) => res.json())
      .then((list: FreelancerUser[]) => {
        setUsers(list)
        setDrafts(Object.fromEntries(list.map((u) => [u.id, toDraft(u)])))
      })
  }, [])

  useEffect(() => {
    if (role === 'SUPER_ADMIN') {
      fetch('/api/admin/approvers')
        .then((res) => res.json())
        .then(setApprovers)
    }
  }, [role])

  const filtered = useMemo(() => {
    const query = search.toLowerCase()
    return users
      .filter((u) => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query))
      .filter((u) => !onlyMine || u.defaultApproverId === callerId)
  }, [users, search, onlyMine, callerId])

  function updateDraft(id: number, field: keyof Draft, value: string) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  function requestApproverChange(user: FreelancerUser, approverId: number) {
    setPendingSave({ kind: 'approver', userId: user.id, approverId })
  }

  function hasPendingChange(user: FreelancerUser): boolean {
    const draft = drafts[user.id]
    if (!draft) return false
    return (
      draft.hireDate !== (user.hireDate ?? '') ||
      draft.grantedTotal !== String(user.granted) ||
      draft.usedTotal !== String(user.used)
    )
  }

  function buildFieldChanges(user: FreelancerUser) {
    const draft = drafts[user.id]
    const changes: { label: string; before: string; after: string }[] = []
    if (draft.hireDate !== (user.hireDate ?? '')) {
      changes.push({ label: '입사일', before: user.hireDate ?? '-', after: draft.hireDate || '-' })
    }
    if (draft.grantedTotal !== String(user.granted)) {
      changes.push({ label: '사용가능 연차', before: String(user.granted), after: draft.grantedTotal })
    }
    if (draft.usedTotal !== String(user.used)) {
      changes.push({ label: '사용 연차', before: String(user.used), after: draft.usedTotal })
    }
    return changes
  }

  function buildDialogChanges(): { label: string; before: string; after: string }[] {
    if (!pendingSave) return []
    const user = users.find((u) => u.id === pendingSave.userId)
    if (!user) return []
    if (pendingSave.kind === 'approver') {
      const newApprover = approvers.find((a) => a.id === pendingSave.approverId)
      return [
        {
          label: '기본 결재자',
          before: user.defaultApproverName ?? '미지정',
          after: newApprover?.name ?? '-',
        },
      ]
    }
    return buildFieldChanges(user)
  }

  async function confirmSave(reason: string) {
    if (!pendingSave) return
    const user = users.find((u) => u.id === pendingSave.userId)
    if (!user) return
    setSubmitting(true)
    try {
      if (pendingSave.kind === 'approver') {
        const res = await fetch(`/api/admin/users/${user.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ defaultApproverId: pendingSave.approverId, reason }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          setErrors((prev) => ({ ...prev, [user.id]: body?.error ?? '처리에 실패했습니다.' }))
          setPendingSave(null)
          return
        }
        const approver = approvers.find((a) => a.id === pendingSave.approverId)
        setUsers((prev) =>
          prev.map((u) =>
            u.id === user.id
              ? { ...u, defaultApproverId: pendingSave.approverId, defaultApproverName: approver?.name ?? null }
              : u
          )
        )
        setErrors((prev) => {
          const next = { ...prev }
          delete next[user.id]
          return next
        })
        setPendingSave(null)
        return
      }

      const draft = drafts[user.id]
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hireDate: draft.hireDate !== (user.hireDate ?? '') ? draft.hireDate : undefined,
          grantedTotal: draft.grantedTotal !== String(user.granted) ? Number(draft.grantedTotal) : undefined,
          usedTotal: draft.usedTotal !== String(user.used) ? Number(draft.usedTotal) : undefined,
          reason,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setErrors((prev) => ({ ...prev, [user.id]: body?.error ?? '처리에 실패했습니다.' }))
        setPendingSave(null)
        return
      }
      const updated = await res.json()
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, hireDate: draft.hireDate || null, granted: updated.granted, used: updated.used, remaining: updated.remaining }
            : u
        )
      )
      setDrafts((prev) => ({
        ...prev,
        [user.id]: {
          hireDate: draft.hireDate,
          grantedTotal: String(updated.granted),
          usedTotal: String(updated.used),
        },
      }))
      setErrors((prev) => {
        const next = { ...prev }
        delete next[user.id]
        return next
      })
      setPendingSave(null)
    } finally {
      setSubmitting(false)
    }
  }

  // 모바일 카드 레이아웃 전용(데스크톱 테이블은 셀 구조가 달라 아래에서 직접 JSX를 작성한다).
  function renderMobileFields(user: FreelancerUser) {
    const draft = drafts[user.id] ?? toDraft(user)
    const disabled = !user.canEdit
    const remaining = (Number(draft.grantedTotal) || 0) - (Number(draft.usedTotal) || 0)
    return (
      <>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">입사일</p>
          <DatePicker
            value={draft.hireDate || undefined}
            onChange={(value) => updateDraft(user.id, 'hireDate', value)}
            placeholder="입사일 선택"
            className="w-full"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">기본 결재자</p>
          {role === 'SUPER_ADMIN' ? (
            <ApproverCombobox
              value={user.defaultApproverId}
              approvers={approvers}
              onChange={(id) => requestApproverChange(user, id)}
              className="w-full"
            />
          ) : (
            <p className="text-sm">{user.defaultApproverName ?? '-'}</p>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">사용가능 연차</p>
          <Input
            type="number"
            step="0.5"
            disabled={disabled}
            value={draft.grantedTotal}
            onChange={(e) => updateDraft(user.id, 'grantedTotal', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">사용 연차</p>
          <Input
            type="number"
            step="0.5"
            disabled={disabled}
            value={draft.usedTotal}
            onChange={(e) => updateDraft(user.id, 'usedTotal', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">미사용 연차</p>
          <p className="text-sm text-muted-foreground">{remaining}</p>
        </div>
      </>
    )
  }

  return (
    <div className="w-full">
      <PageHeader title="프리랜서 정보 관리" description="프리랜서의 입사일, 기본 결재자, 연차 정보를 관리합니다." />

      <div className="mb-4 flex items-center justify-end gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="이름/이메일 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 pl-8"
          />
        </div>
        {role === 'APPROVER' && (
          <Button variant={onlyMine ? 'default' : 'outline'} onClick={() => setOnlyMine((v) => !v)}>
            담당 프리랜서만 보기
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {search
            ? `'${search}' 검색 결과가 없습니다.`
            : onlyMine
              ? '담당 프리랜서가 없습니다.'
              : '승인된 프리랜서가 없습니다.'}
        </p>
      ) : (
        <>
          <Table className="hidden lg:table" containerClassName="hidden lg:block">
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>입사일</TableHead>
                <TableHead>기본 결재자</TableHead>
                <TableHead>사용가능 연차</TableHead>
                <TableHead>사용 연차</TableHead>
                <TableHead>미사용 연차</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => {
                const draft = drafts[user.id] ?? toDraft(user)
                const remaining = (Number(draft.grantedTotal) || 0) - (Number(draft.usedTotal) || 0)
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="cursor-pointer text-left font-medium hover:underline"
                        onClick={() => setHistoryUserId(user.id)}
                      >
                        {user.name}
                      </button>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </TableCell>
                    <TableCell>
                      <DatePicker
                        value={draft.hireDate || undefined}
                        onChange={(value) => updateDraft(user.id, 'hireDate', value)}
                        placeholder="입사일 선택"
                      />
                    </TableCell>
                    <TableCell>
                      {role === 'SUPER_ADMIN' ? (
                        <ApproverCombobox
                          value={user.defaultApproverId}
                          approvers={approvers}
                          onChange={(id) => requestApproverChange(user, id)}
                        />
                      ) : (
                        <p className="text-sm">{user.defaultApproverName ?? '-'}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.5"
                        disabled={!user.canEdit}
                        value={draft.grantedTotal}
                        onChange={(e) => updateDraft(user.id, 'grantedTotal', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.5"
                        disabled={!user.canEdit}
                        value={draft.usedTotal}
                        onChange={(e) => updateDraft(user.id, 'usedTotal', e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{remaining}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end">
                        <Button
                          disabled={!user.canEdit || !hasPendingChange(user)}
                          onClick={() => setPendingSave({ kind: 'fields', userId: user.id })}
                        >
                          저장
                        </Button>
                      </div>
                      {errors[user.id] && (
                        <p className="mt-1 text-right text-sm text-destructive">{errors[user.id]}</p>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {filtered.map((user) => (
              <div key={user.id} className="space-y-3 rounded-lg border p-4">
                <div>
                  <button
                    type="button"
                    className="cursor-pointer text-left font-medium hover:underline"
                    onClick={() => setHistoryUserId(user.id)}
                  >
                    {user.name}
                  </button>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="space-y-2">{renderMobileFields(user)}</div>
                <Button
                  className="w-full"
                  disabled={!user.canEdit || !hasPendingChange(user)}
                  onClick={() => setPendingSave({ kind: 'fields', userId: user.id })}
                >
                  저장
                </Button>
                {errors[user.id] && <p className="text-sm text-destructive">{errors[user.id]}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {pendingSave !== null && (
        <LeaveAdjustmentDialog
          open={pendingSave !== null}
          onOpenChange={(open) => !open && setPendingSave(null)}
          changes={buildDialogChanges()}
          onConfirm={confirmSave}
          submitting={submitting}
        />
      )}

      <UserHistoryPanel
        open={historyUserId !== null}
        onOpenChange={(open) => !open && setHistoryUserId(null)}
        user={users.find((u) => u.id === historyUserId) ?? null}
      />
    </div>
  )
}
