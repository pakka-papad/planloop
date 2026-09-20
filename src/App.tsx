import {
  BookOpenTextIcon,
  PlusIcon,
} from "@phosphor-icons/react"
import { useEffect, useSyncExternalStore, type ReactNode } from "react"

import { AppLink } from "./navigation"
import { ActionPlanPage } from "./pages/ActionPlanPage"
import { ActionPlansPage } from "./pages/ActionPlansPage"
import { CreateActionPlanPage } from "./pages/CreateActionPlanPage"
import { HomePage } from "./pages/HomePage"
import { PlaceholderPage } from "./pages/PlaceholderPage"

interface Route {
  readonly content: ReactNode
  readonly section: "home" | "action-plans" | "review-proposals" | "incidents" | null
  readonly title: string
}

function subscribeToNavigation(onChange: () => void) {
  window.addEventListener("popstate", onChange)
  return () => window.removeEventListener("popstate", onChange)
}

function usePathname(): string {
  return useSyncExternalStore(
    subscribeToNavigation,
    () => window.location.pathname,
    () => "/",
  )
}

export default function App() {
  const pathname = usePathname()
  const route = resolveRoute(pathname)

  useEffect(() => {
    document.title = `${route.title} · PlanLoop`
  }, [route.title])

  return (
    <div className="min-h-svh bg-muted/25">
      <Header section={route.section} />
      {route.content}
    </div>
  )
}

function Header({ section }: { readonly section: Route["section"] }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 sm:px-8">
        <AppLink className="flex items-center gap-2.5" href="/">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <BookOpenTextIcon aria-hidden="true" size={20} weight="bold" />
          </span>
          <span className="font-semibold tracking-tight">PlanLoop</span>
        </AppLink>

        <nav className="ml-auto hidden items-center gap-1 sm:flex" aria-label="Primary navigation">
          <NavLink active={section === "home"} href="/">Home</NavLink>
          <NavLink active={section === "action-plans"} href="/action-plans">Action plans</NavLink>
          <NavLink active={section === "review-proposals"} href="/review-proposals">Reviews</NavLink>
        </nav>

        <AppLink
          className="ml-auto inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 sm:ml-2"
          href="/incidents/new"
        >
          <PlusIcon aria-hidden="true" size={15} weight="bold" />
          Create incident
        </AppLink>
      </div>
    </header>
  )
}

function NavLink({
  active,
  children,
  href,
}: {
  readonly active: boolean
  readonly children: ReactNode
  readonly href: string
}) {
  return (
    <AppLink
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
      href={href}
    >
      {children}
    </AppLink>
  )
}

function resolveRoute(pathname: string): Route {
  if (pathname === "/") {
    return { content: <HomePage />, section: "home", title: "Home" }
  }

  if (pathname === "/action-plans") {
    return { content: <ActionPlansPage />, section: "action-plans", title: "Action plans" }
  }

  if (pathname === "/action-plans/new") {
    return {
      content: <CreateActionPlanPage />,
      section: "action-plans",
      title: "Create action plan",
    }
  }

  const actionPlanMatch = pathname.match(/^\/action-plans\/([^/]+)$/)
  if (actionPlanMatch) {
    const planId = actionPlanMatch[1]
    return {
      content: <ActionPlanPage key={planId} planId={planId} />,
      section: "action-plans",
      title: "Action plan",
    }
  }

  if (pathname === "/review-proposals" || /^\/review-proposals\/[^/]+$/.test(pathname)) {
    return {
      content: (
        <PlaceholderPage
          description="The review queue and focused proposal review experience will be implemented after the action-plan workflow."
          eyebrow="Review proposals"
          title="Turn incident evidence into better plans."
        />
      ),
      section: "review-proposals",
      title: "Review proposals",
    }
  }

  if (pathname === "/incidents/new" || /^\/incidents\/[^/]+$/.test(pathname)) {
    return {
      content: (
        <PlaceholderPage
          description="Incident creation and the focused incident workspace will be implemented after the action-plan workflow."
          eyebrow="Incident response"
          title="Run the response from one focused workspace."
        />
      ),
      section: "incidents",
      title: "Incidents",
    }
  }

  return {
    content: (
      <PlaceholderPage
        description="The page you requested does not exist. Return home to choose an available workflow."
        eyebrow="Not found"
        title="There is nothing here."
      />
    ),
    section: null,
    title: "Not found",
  }
}
