'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
    <div className="mx-auto mt-10 max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">프리랜서 정보 관리</h1>
      {users.length === 0 && <p className="text-sm text-muted-foreground">승인된 프리랜서가 없습니다.</p>}
      <ul className="space-y-3">
        {users.map((user) => (
          <li key={user.id} className="flex flex-col gap-2 rounded border p-3">
            <div className="flex items-center gap-3">
              <div className="w-40">
                <p className="font-medium">{user.name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                <p className="text-xs text-muted-foreground">입사일: {user.hireDate ?? '-'}</p>
              </div>
              <Input
                placeholder="직급"
                value={user.position ?? ''}
                onChange={(e) => updateField(user.id, 'position', e.target.value)}
              />
              <Input
                placeholder="부서"
                value={user.department ?? ''}
                onChange={(e) => updateField(user.id, 'department', e.target.value)}
              />
              <Input
                placeholder="기본 결재자 ID"
                value={user.defaultApproverId ?? ''}
                onChange={(e) => updateField(user.id, 'defaultApproverId', e.target.value)}
              />
              <Button onClick={() => save(user)} disabled={savingId === user.id}>
                {savingId === user.id ? '저장 중...' : '저장'}
              </Button>
            </div>
            {errors[user.id] && <p className="text-sm text-destructive">{errors[user.id]}</p>}
            {savedId === user.id && !errors[user.id] && (
              <p className="text-sm text-muted-foreground">저장되었습니다.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
