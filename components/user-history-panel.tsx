'use client'

import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'

interface HistoryUser {
  id: number
  name: string
  email: string
  hireDate: string | null
  defaultApproverName: string | null
  granted: number
  used: number
  remaining: number
}

interface HistoryEntry {
  category: '발생' | '조정' | '사용' | '결재자 변경' | '입사일 변경'
  date: string
  detail: string
  reason: string
  actorName: string | null
}

interface UserHistoryPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: HistoryUser | null
}

export function UserHistoryPanel({ open, onOpenChange, user }: UserHistoryPanelProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`/api/admin/users/${user.id}/history`)
      .then((res) => res.json())
      .then((list: HistoryEntry[]) => setHistory(list))
      .finally(() => setLoading(false))
  }, [open, user])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:w-[95vw] data-[side=right]:sm:max-w-none lg:data-[side=right]:w-1/4">
        <SheetHeader>
          <SheetTitle>{user?.name ?? ''}</SheetTitle>
          <SheetDescription>{user?.email ?? ''}</SheetDescription>
        </SheetHeader>
        {user && (
          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">입사일</p>
                <p>{user.hireDate ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">기본 결재자</p>
                <p>{user.defaultApproverName ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">발생 연차</p>
                <p>{user.granted}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">사용 연차</p>
                <p>{user.used}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">미사용 연차</p>
                <p>{user.remaining}</p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">이력</p>
              {loading ? (
                <p className="text-sm text-muted-foreground">불러오는 중...</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground">이력이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((entry, i) => (
                    <div key={i} className="rounded-md border p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{entry.category}</Badge>
                        <span className="text-xs text-muted-foreground">{entry.date}</span>
                      </div>
                      <p className="mt-1">{entry.detail}</p>
                      <p className="text-xs text-muted-foreground">
                        사유: {entry.reason}
                        {entry.actorName && ` · 처리자: ${entry.actorName}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
