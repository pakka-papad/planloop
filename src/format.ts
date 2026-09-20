const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
})

export function formatDate(value: string): string {
  return dateFormatter.format(new Date(value))
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

export function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value))
}
