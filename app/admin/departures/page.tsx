'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/loading-spinner'
import { PageHeader } from '@/components/page-header'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface DepartedUser {
  id: number
  name: string
  email: string
  role: 'FREELANCER' | 'APPROVER'
  resignedAt: string | null
  resignReason: string | null
}

function roleLabel(role: DepartedUser['role']) {
  return role === 'FREELANCER' ? '프리랜서' : '결재자'
}

export default function AdminDeparturesPage() {
  const [users, setUsers] = useState<DepartedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<DepartedUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DepartedUser | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/admin/departures')
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

  async function confirmRestore() {
    if (!restoreTarget) return
    setSubmitting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/departures/${restoreTarget.id}/restore`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setActionError(body?.error ?? '복구에 실패했습니다.')
        return
      }
      setRestoreTarget(null)
      load()
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setSubmitting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/departures/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setActionError(body?.error ?? '삭제에 실패했습니다.')
        return
      }
      setDeleteTarget(null)
      load()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="퇴사자 관리"
        description="퇴사 처리된 프리랜서·결재자를 복구하거나 정보를 삭제합니다."
      />

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground">퇴사 처리된 사용자가 없습니다.</p>
      ) : (
        <>
          <Table className="hidden lg:table" containerClassName="hidden lg:block">
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>퇴사일</TableHead>
                <TableHead>퇴사 사유</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{roleLabel(u.role)}</Badge>
                  </TableCell>
                  <TableCell>{u.resignedAt ? u.resignedAt.slice(0, 10) : '-'}</TableCell>
                  <TableCell className="max-w-64 truncate" title={u.resignReason ?? ''}>
                    {u.resignReason ?? '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setRestoreTarget(u)}>
                        복구
                      </Button>
                      <Button variant="destructive" onClick={() => setDeleteTarget(u)}>
                        정보 삭제
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {users.map((u) => (
              <div key={u.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{u.name}</p>
                  <Badge variant="outline">{roleLabel(u.role)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{u.email}</p>
                <p className="text-sm text-muted-foreground">
                  퇴사일: {u.resignedAt ? u.resignedAt.slice(0, 10) : '-'}
                </p>
                <p className="text-sm text-muted-foreground">사유: {u.resignReason ?? '-'}</p>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setRestoreTarget(u)}>
                    복구
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={() => setDeleteTarget(u)}>
                    정보 삭제
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title="퇴사자 복구"
        description={`${restoreTarget?.name ?? ''}을(를) 다시 활성 계정으로 되돌립니다. 즉시 로그인이 가능해집니다.`}
        confirmLabel="복구"
        onConfirm={confirmRestore}
        submitting={submitting}
        error={actionError}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="정보 삭제"
        description={
          deleteTarget?.role === 'FREELANCER'
            ? `${deleteTarget?.name ?? ''}의 계정과 연차 발생/사용 이력이 모두 삭제됩니다. 되돌릴 수 없습니다.`
            : `${deleteTarget?.name ?? ''}의 이름·이메일 등 개인정보가 삭제되고, 담당하던 프리랜서의 기본 결재자는 공란으로 바뀝니다. 되돌릴 수 없습니다.`
        }
        confirmLabel="영구 삭제"
        onConfirm={confirmDelete}
        submitting={submitting}
        error={actionError}
        destructive
      />
    </div>
  )
}
