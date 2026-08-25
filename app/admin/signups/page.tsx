'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/date-picker'
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

interface PendingUser {
  id: number
  name: string
  email: string
}

type SignupRole = 'FREELANCER' | 'APPROVER'

export default function AdminSignupsPage() {
  const [pending, setPending] = useState<PendingUser[]>([])
  const [roles, setRoles] = useState<Record<number, SignupRole>>({})
  const [hireDates, setHireDates] = useState<Record<number, string>>({})
  const [errors, setErrors] = useState<Record<number, string>>({})

  useEffect(() => {
    fetch('/api/admin/signups')
      .then((res) => res.json())
      .then(setPending)
  }, [])

  function getRole(id: number): SignupRole {
    return roles[id] ?? 'FREELANCER'
  }

  async function decide(id: number, decision: 'APPROVED' | 'REJECTED') {
    const role = getRole(id)
    const res = await fetch(`/api/admin/signups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision,
        role: decision === 'APPROVED' ? role : undefined,
        hireDate: decision === 'APPROVED' && role === 'FREELANCER' ? hireDates[id] : undefined,
      }),
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

  function renderFields(user: PendingUser, layout: 'row' | 'stack') {
    const role = getRole(user.id)
    const wrapClass = layout === 'row' ? 'flex items-center gap-2' : 'space-y-1'
    return (
      <div className={wrapClass}>
        {layout === 'stack' && <p className="text-xs text-muted-foreground">권한</p>}
        <Select value={role} onValueChange={(value) => setRoles((prev) => ({ ...prev, [user.id]: value as SignupRole }))}>
          <SelectTrigger className={layout === 'row' ? 'w-32' : 'w-full'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FREELANCER">프리랜서</SelectItem>
            <SelectItem value="APPROVER">결재담당자</SelectItem>
          </SelectContent>
        </Select>
        {role === 'FREELANCER' && (
          <div className={layout === 'stack' ? 'space-y-1' : undefined}>
            {layout === 'stack' && <p className="text-xs text-muted-foreground">입사일</p>}
            <DatePicker
              value={hireDates[user.id]}
              onChange={(value) => setHireDates((prev) => ({ ...prev, [user.id]: value }))}
              placeholder="입사일 선택"
              className={layout === 'stack' ? 'w-full' : 'w-40'}
            />
          </div>
        )}
      </div>
    )
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
                <TableHead>권한 / 입사일</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>{renderFields(user, 'row')}</TableCell>
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
                {renderFields(user, 'stack')}
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
