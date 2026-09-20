import {
  type AnchorHTMLAttributes,
  type MouseEvent,
} from "react"

import { navigateTo } from "./navigate"

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
    navigateTo(href)
  }

  return <a href={href} onClick={navigate} {...props} />
}
