import { Construction } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Props = { title: string; description: string; sprintNumber?: number }

export function PlaceholderPage({ title, description, sprintNumber }: Props) {
  return (
    <div className="px-10 pt-8">
      <header className="mb-6 flex items-center gap-3">
        <h1 className="font-display text-3xl text-text">{title}</h1>
        {sprintNumber != null && <Badge variant="outline">Sprint {sprintNumber}</Badge>}
      </header>
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="bg-accent/15 text-accent flex h-14 w-14 items-center justify-center rounded-2xl">
            <Construction className="h-6 w-6" />
          </span>
          <div className="max-w-lg">
            <p className="font-display text-xl text-text">Coming next in the build</p>
            <p className="mt-2 text-sm text-muted/70">{description}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
