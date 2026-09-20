import { ArrowLeftIcon } from "@phosphor-icons/react"

import { AppLink } from "../navigation"

export function PlaceholderPage({
  description,
  eyebrow,
  title,
}: {
  readonly description: string
  readonly eyebrow: string
  readonly title: string
}) {
  return (
    <main className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl place-items-center px-5 py-16 sm:px-8">
      <div className="max-w-xl text-center">
        <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
          Coming next
        </span>
        <p className="mt-6 text-sm font-semibold text-primary">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-4 leading-7 text-muted-foreground">{description}</p>
        <AppLink
          className="mt-8 inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent"
          href="/"
        >
          <ArrowLeftIcon aria-hidden="true" size={16} />
          Back to home
        </AppLink>
      </div>
    </main>
  )
}
