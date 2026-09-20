import {
  type AnchorHTMLAttributes,
  type MouseEvent,
} from "react"

export function AppLink({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { readonly href: string }) {
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)

    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return

    event.preventDefault()
    window.history.pushState(null, "", href)
    window.dispatchEvent(new PopStateEvent("popstate"))
    window.scrollTo({ top: 0 })
  }

  return <a href={href} onClick={navigate} {...props} />
}
