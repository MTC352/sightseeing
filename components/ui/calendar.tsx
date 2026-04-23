'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'

import { cn } from '@/lib/utils'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-4', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-6',
        month: 'flex flex-col gap-4',
        caption: 'flex items-center justify-between px-1',
        caption_label: 'text-sm font-semibold text-foreground tracking-tight',
        nav: 'flex items-center gap-1',
        nav_button: cn(
          'inline-flex items-center justify-center rounded-full w-7 h-7 border border-border bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        ),
        nav_button_previous: '',
        nav_button_next: '',
        table: 'w-full border-collapse',
        head_row: 'flex mb-1',
        head_cell: 'w-9 text-center text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider',
        row: 'flex w-full mt-1',
        cell: cn(
          'relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20',
          '[&:has([aria-selected].day-range-end)]:rounded-r-full',
          '[&:has([aria-selected].day-outside)]:bg-primary/5',
          '[&:has([aria-selected])]:bg-primary/10',
          'first:[&:has([aria-selected])]:rounded-l-full',
          'last:[&:has([aria-selected])]:rounded-r-full',
        ),
        day: cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium text-foreground transition-all',
          'hover:bg-secondary hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          'aria-selected:opacity-100',
          'disabled:pointer-events-none',
        ),
        day_range_end: 'day-range-end',
        day_selected: [
          'bg-primary text-primary-foreground font-semibold shadow-sm',
          'hover:bg-primary hover:text-primary-foreground',
          'focus:bg-primary focus:text-primary-foreground',
        ].join(' '),
        day_today: [
          'border border-primary/40 text-primary font-semibold',
          'not-[.day_selected]:bg-primary/5',
        ].join(' '),
        day_outside: 'day-outside text-muted-foreground/40 aria-selected:bg-primary/5 aria-selected:text-muted-foreground',
        day_disabled: 'text-muted-foreground/30 line-through',
        day_range_middle: 'aria-selected:bg-primary/10 aria-selected:text-foreground rounded-none',
        day_hidden: 'invisible',
        ...classNames,
      }}
      components={{
        IconLeft: ({ ...props }) => <ChevronLeft className="h-3.5 w-3.5" />,
        IconRight: ({ ...props }) => <ChevronRight className="h-3.5 w-3.5" />,
      }}
      {...props}
    />
  )
}
Calendar.displayName = 'Calendar'

export { Calendar }
