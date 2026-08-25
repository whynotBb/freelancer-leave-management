'use client'

import { useState } from 'react'
import { SearchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface Approver {
  id: number
  name: string
  email: string
}

interface ApproverComboboxProps {
  value: number | null
  approvers: Approver[]
  onChange: (id: number) => void
  placeholder?: string
  className?: string
}

export function ApproverCombobox({
  value,
  approvers,
  onChange,
  placeholder = '결재자 선택',
  className,
}: ApproverComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = approvers.find((a) => a.id === value)
  const filtered = approvers.filter(
    (a) => a.name.includes(query) || a.email.includes(query)
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('w-48 justify-start font-normal', !selected && 'text-muted-foreground', className)}
        >
          {selected ? selected.name : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="relative mb-2">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름/이메일 검색"
            className="pl-8"
          />
        </div>
        <div className="max-h-60 space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">검색 결과가 없습니다.</p>
          )}
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onChange(a.id)
                setOpen(false)
                setQuery('')
              }}
            >
              <div className="font-medium">{a.name}</div>
              <div className="text-xs text-muted-foreground">{a.email}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
