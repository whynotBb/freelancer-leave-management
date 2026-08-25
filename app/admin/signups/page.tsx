'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface PendingUser {
  id: number
  name: string
  email: string
}

export default function AdminSignupsPage() {
  const [pending, setPending] = useState<PendingUser[]>([])
  const [hireDates, setHireDates] = useState<Record<number, string>>({})
  const [errors, setErrors] = useState<Record<number, string>>({})

  useEffect(() => {
    fetch('/api/admin/signups')
      .then((res) => res.json())
      .then(setPending)
  }, [])

  async function decide(id: number, decision: 'APPROVED' | 'REJECTED') {
    const res = await fetch(`/api/admin/signups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, hireDate: hireDates[id] }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setErrors((prev) => ({
        ...prev,
        [id]: body?.error ?? '처리에 실패했습니다.',
      }))
      return
    }
    setErrors((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setPending((prev) => prev.filter((u) => u.id !== id))
  }

  return (
    <div className="mx-auto mt-10 max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold">가입 승인 대기</h1>
      {pending.length === 0 && <p className="text-sm text-muted-foreground">대기 중인 신청이 없습니다.</p>}
      <ul className="space-y-3">
        {pending.map((user) => (
          <li key={user.id} className="flex flex-col gap-2 rounded border p-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="font-medium">{user.name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
              <Input
                type="date"
                className="w-40"
                onChange={(e) => setHireDates((prev) => ({ ...prev, [user.id]: e.target.value }))}
              />
              <Button onClick={() => decide(user.id, 'APPROVED')}>승인</Button>
              <Button variant="outline" onClick={() => decide(user.id, 'REJECTED')}>
                거절
              </Button>
            </div>
            {errors[user.id] && <p className="text-sm text-destructive">{errors[user.id]}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}
