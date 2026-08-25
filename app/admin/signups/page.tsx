'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/date-picker'
import { PageHeader } from '@/components/page-header'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
    <div className="w-full">
      <PageHeader title="가입 승인" description="프리랜서 가입 신청을 검토하고 승인 또는 거절합니다." />
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">대기 중인 신청이 없습니다.</p>
      ) : (
        <>
          <Table className="hidden lg:table" containerClassName="hidden lg:block">
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>입사일</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <DatePicker
                      value={hireDates[user.id]}
                      onChange={(value) => setHireDates((prev) => ({ ...prev, [user.id]: value }))}
                      placeholder="입사일 선택"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button onClick={() => decide(user.id, 'APPROVED')}>승인</Button>
                      <Button variant="outline" onClick={() => decide(user.id, 'REJECTED')}>
                        거절
                      </Button>
                    </div>
                    {errors[user.id] && (
                      <p className="mt-1 text-right text-sm text-destructive">{errors[user.id]}</p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {pending.map((user) => (
              <div key={user.id} className="space-y-3 rounded-lg border p-4">
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">입사일</p>
                  <DatePicker
                    value={hireDates[user.id]}
                    onChange={(value) => setHireDates((prev) => ({ ...prev, [user.id]: value }))}
                    placeholder="입사일 선택"
                    className="w-full"
                  />
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => decide(user.id, 'APPROVED')}>
                    승인
                  </Button>
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() => decide(user.id, 'REJECTED')}
                  >
                    거절
                  </Button>
                </div>
                {errors[user.id] && <p className="text-sm text-destructive">{errors[user.id]}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
