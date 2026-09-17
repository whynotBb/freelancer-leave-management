'use client'

import { CalendarIcon, UserIcon, FileTextIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { LEAVE_TYPE_LABEL } from '@/lib/domain/calendar-utils'
import type { CalendarEventRow } from '@/lib/db/calendar'

interface CalendarEventDialogProps {
  event: CalendarEventRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CalendarEventDialog({ event, open, onOpenChange }: CalendarEventDialogProps) {
  if (!event) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="flex flex-wrap items-center gap-2 border-b-0 pb-0 text-base font-bold pr-6 leading-snug break-words whitespace-normal max-w-full">
            <Badge
              variant="outline"
              className={cn(
                'shrink-0 text-xs px-2 py-0.5 font-semibold',
                event.type === 'FULL'
                  ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
                  : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
              )}
            >
              {LEAVE_TYPE_LABEL[event.type]}
            </Badge>
            <span className="break-words whitespace-normal break-keep">{event.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* 신청인 */}
          <div className="flex items-center gap-3 text-sm">
            <div className="rounded-md bg-muted p-2 text-muted-foreground">
              <UserIcon className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">신청인</p>
              <p className="font-medium">{event.requesterName} {event.isMine && '(나)'}</p>
            </div>
          </div>

          {/* 기간 및 일수 */}
          <div className="flex items-center gap-3 text-sm">
            <div className="rounded-md bg-muted p-2 text-muted-foreground">
              <CalendarIcon className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">휴가 기간</p>
              <p className="font-medium">
                {event.startDate === event.endDate ? event.startDate : `${event.startDate} ~ ${event.endDate}`}
                <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold">
                  {event.requestedDays}일
                </span>
              </p>
            </div>
          </div>

          {/* 사유 */}
          <div className="flex items-start gap-3 text-sm">
            <div className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground">
              <FileTextIcon className="size-4" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">신청 사유</p>
              <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/40 p-2.5 text-sm leading-relaxed">
                {event.reason || '사유가 작성되지 않았습니다.'}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
