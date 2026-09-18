interface PageHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="sticky top-14 z-10 mb-6 border-b bg-background pb-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        {action}
      </div>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}
