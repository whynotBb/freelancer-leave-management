'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/page-header'
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
  position: string | null
  department: string | null
  defaultApproverId: number | null
  hireDate: string | null
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<FreelancerUser[]>([])
  const [savingId, setSavingId] = useState<number | null>(null)
  const [savedId, setSavedId] = useState<number | null>(null)
  const [errors, setErrors] = useState<Record<number, string>>({})

  useEffect(() => {
    fetch('/api/admin/users')
      .then((res) => res.json())
      .then(setUsers)
  }, [])

  function updateField(id: number, field: keyof FreelancerUser, value: string) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, [field]: value } : u)))
  }

  async function save(user: FreelancerUser) {
    setSavingId(user.id)
    setSavedId(null)
    setErrors((prev) => {
      const next = { ...prev }
      delete next[user.id]
      return next
    })
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position: user.position,
          department: user.department,
          defaultApproverId: user.defaultApproverId ? Number(user.defaultApproverId) : undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setErrors((prev) => ({ ...prev, [user.id]: body?.error ?? '저장에 실패했습니다.' }))
        return
      }
      setSavedId(user.id)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="프리랜서 정보 관리"
        description="승인된 프리랜서의 직급, 부서, 기본 결재자 정보를 관리합니다."
      />
      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">승인된 프리랜서가 없습니다.</p>
      ) : (
        <>
          <Table className="hidden lg:table" containerClassName="hidden lg:block">
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>입사일</TableHead>
                <TableHead>직급</TableHead>
                <TableHead>부서</TableHead>
                <TableHead>기본 결재자 ID</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.hireDate ?? '-'}</TableCell>
                  <TableCell>
                    <Input
                      placeholder="직급"
                      value={user.position ?? ''}
                      onChange={(e) => updateField(user.id, 'position', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="부서"
                      value={user.department ?? ''}
                      onChange={(e) => updateField(user.id, 'department', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="기본 결재자 ID"
                      value={user.defaultApproverId ?? ''}
                      onChange={(e) => updateField(user.id, 'defaultApproverId', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <Button onClick={() => save(user)} disabled={savingId === user.id}>
                        {savingId === user.id ? '저장 중...' : '저장'}
                      </Button>
                    </div>
                    {errors[user.id] && (
                      <p className="mt-1 text-right text-sm text-destructive">{errors[user.id]}</p>
                    )}
                    {savedId === user.id && !errors[user.id] && (
                      <p className="mt-1 text-right text-sm text-muted-foreground">저장되었습니다.</p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {users.map((user) => (
              <div key={user.id} className="space-y-3 rounded-lg border p-4">
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground">입사일: {user.hireDate ?? '-'}</p>
                </div>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">직급</p>
                    <Input
                      placeholder="직급"
                      value={user.position ?? ''}
                      onChange={(e) => updateField(user.id, 'position', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">부서</p>
                    <Input
                      placeholder="부서"
                      value={user.department ?? ''}
                      onChange={(e) => updateField(user.id, 'department', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">기본 결재자 ID</p>
                    <Input
                      placeholder="기본 결재자 ID"
                      value={user.defaultApproverId ?? ''}
                      onChange={(e) => updateField(user.id, 'defaultApproverId', e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => save(user)}
                  disabled={savingId === user.id}
                >
                  {savingId === user.id ? '저장 중...' : '저장'}
                </Button>
                {errors[user.id] && <p className="text-sm text-destructive">{errors[user.id]}</p>}
                {savedId === user.id && !errors[user.id] && (
                  <p className="text-sm text-muted-foreground">저장되었습니다.</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
