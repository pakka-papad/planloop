import {
  ArrowRightIcon,
  BookOpenTextIcon,
  ClipboardTextIcon,
  ListChecksIcon,
  PlusIcon,
} from "@phosphor-icons/react"

import { AppLink } from "../navigation"

const workspaceCards = [
  {
    href: "/action-plans",
    icon: BookOpenTextIcon,
    title: "Action plans",
    description: "Find the approved response plan for an operational issue.",
    action: "Browse plans",
    available: true,
  },
  {
    href: "/review-proposals",
    icon: ListChecksIcon,
    title: "Pending reviews",
    description: "Review improvements learned from completed incidents.",
    action: "View review queue",
    available: false,
  },
  {
    href: "/incidents/new",
    icon: ClipboardTextIcon,
    title: "Incident response",
    description: "Start an incident and work from a pinned action plan.",
    action: "Create incident",
    available: false,
  },
] as const

export function HomePage() {
  return (
    <main>
      <section className="border-b bg-background">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)] lg:items-end">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-primary">Operational readiness</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl sm:leading-[1.1]">
              Clear plans for the moments that matter.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              PlanLoop keeps response guidance close at hand and turns completed incidents
              into focused improvements for the next response.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <AppLink
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                href="/action-plans"
              >
                Browse action plans
                <ArrowRightIcon aria-hidden="true" size={16} weight="bold" />
              </AppLink>
              <AppLink
                className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
                href="/incidents/new"
              >
                <PlusIcon aria-hidden="true" size={16} weight="bold" />
                Create incident
              </AppLink>
            </div>
          </div>

          <aside className="rounded-xl border bg-muted/35 p-5">
            <p className="text-sm font-semibold">How PlanLoop works</p>
            <ol className="mt-4 space-y-4 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="font-semibold text-primary">01</span>
                Respond using an approved action plan.
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-primary">02</span>
                Record what happened during the incident.
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-primary">03</span>
                Review and publish the proposed improvements.
              </li>
            </ol>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16" aria-labelledby="workspace-heading">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-primary">Workspace</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight" id="workspace-heading">
            What do you need to do?
          </h2>
          <p className="mt-2 text-muted-foreground">
            Start with the task at hand. Each workflow keeps its context in one place.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {workspaceCards.map(({ action, available, description, href, icon: Icon, title }) => (
            <AppLink
              className="group flex min-h-64 flex-col rounded-xl border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-accent/30"
              href={href}
              key={href}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon aria-hidden="true" size={22} weight="bold" />
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${available ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {available ? "Available" : "Coming next"}
                </span>
              </div>
              <h3 className="mt-8 text-lg font-semibold">{title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{description}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                {action}
                <ArrowRightIcon
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5"
                  size={15}
                  weight="bold"
                />
              </span>
            </AppLink>
          ))}
        </div>
      </section>
    </main>
  )
}
