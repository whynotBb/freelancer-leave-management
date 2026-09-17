'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { LEAVE_TYPE_LABEL } from '@/lib/domain/calendar-utils'
import type { CalendarEventRow } from '@/lib/db/calendar'

interface DayEventsDialogProps {
  dateStr: string | null
  events: CalendarEventRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onEventClick: (event: CalendarEventRow) => void
}

export function DayEventsDialog({
  dateStr,
  events,
  open,
  onOpenChange,
  onEventClick,
}: DayEventsDialogProps) {
  if (!dateStr || events.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm max-w-[calc(100%-2rem)]">
        <DialogHeader className="text-left border-b pb-2">
          <DialogTitle className="text-sm font-bold border-b-0 pb-0 flex items-center justify-between">
            <span>{dateStr} 휴가 목록</span>
            <span className="text-xs font-normal text-muted-foreground">총 {events.length}건</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1 pt-1">
          {events.map((evt) => (
            <button
              key={`${evt.id}-${evt.startDate}`}
              onClick={() => {
                onOpenChange(false)
                onEventClick(evt)
              }}
              className="w-full flex items-center justify-between gap-2 p-2 rounded-md hover:bg-accent/60 transition-colors text-left border bg-card/50"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 text-[10px] px-1.5 py-0.5 font-semibold',
                    evt.type === 'FULL'
                      ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
                      : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                  )}
                >
                  {LEAVE_TYPE_LABEL[evt.type]}
                </Badge>
                <span className="font-semibold text-sm truncate">{evt.requesterName}</span>
              </div>
              <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                {evt.title}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
