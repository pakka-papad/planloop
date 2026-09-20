export function navigateTo(href: string) {
  window.history.pushState(null, "", href)
  window.dispatchEvent(new PopStateEvent("popstate"))
  window.scrollTo({ top: 0 })
}
