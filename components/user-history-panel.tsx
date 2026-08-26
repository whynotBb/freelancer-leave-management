'use client'

import { useEffect, useState } from 'react'
import { DownloadIcon } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
  category: '발생' | '연차 조정' | '사용' | '결재자 변경' | '입사일 변경' | '만근 예외'
  date: string
  detail: string
  reason: string
  actorName: string | null
}

const CATEGORY_BADGE_CLASS: Record<HistoryEntry['category'], string> = {
  발생: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  '연차 조정': 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  사용: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  '결재자 변경': 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300',
  '입사일 변경': 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300',
  '만근 예외': 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
}

interface UserHistoryPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: HistoryUser | null
}

export function UserHistoryPanel({ open, onOpenChange, user }: UserHistoryPanelProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`/api/admin/users/${user.id}/history`)
      .then((res) => {
        if (!res.ok) throw new Error('history fetch failed')
        return res.json()
      })
      .then((list: HistoryEntry[]) => setHistory(list))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false))
  }, [open, user])

  async function downloadExport() {
    if (!user) return
    setExportError(null)
    setExporting(true)
    try {
      const res = await fetch(`/api/admin/users/export?mode=selected&ids=${user.id}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setExportError(body?.error ?? '다운로드에 실패했습니다.')
        return
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
      const filename = match ? decodeURIComponent(match[1]) : '프리랜서_연차정보.xlsx'

      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      setExportError('다운로드에 실패했습니다.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:w-[95vw] data-[side=right]:sm:max-w-none min-[501px]:data-[side=right]:w-[max(400px,25vw)]">
        <SheetHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-2 pr-8">
            <div>
              <SheetTitle>{user?.name ?? ''}</SheetTitle>
              <SheetDescription>{user?.email ?? ''}</SheetDescription>
            </div>
            {user && (
              <Button variant="outline" size="sm" disabled={exporting} onClick={downloadExport}>
                <DownloadIcon className="size-4" />
                엑셀 다운로드
              </Button>
            )}
          </div>
          {exportError && <p className="text-sm text-destructive">{exportError}</p>}
        </SheetHeader>
        {user && (
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
            <div className="grid grid-cols-2 gap-3 border-b border-border pt-4 pb-4 text-sm">
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
                <p className="text-xs text-muted-foreground">잔여 연차</p>
                <p>{user.remaining}</p>
              </div>
            </div>
            <div className="mt-4 flex min-h-0 flex-1 flex-col">
              <p className="mb-2 text-sm font-medium">이력</p>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {loading ? (
                  <p className="text-sm text-muted-foreground">불러오는 중...</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">이력이 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {history.map((entry, i) => (
                      <div key={i} className="rounded-md border p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className={CATEGORY_BADGE_CLASS[entry.category]}>
                            {entry.category}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{entry.date}</span>
                        </div>
                        <p className="mt-1">{entry.detail}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-semibold">사유:</span> {entry.reason}
                          {entry.actorName && (
                            <>
                              {' · '}
                              <span className="font-semibold">처리자:</span> {entry.actorName}
                            </>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
