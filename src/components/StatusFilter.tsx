import { Menu } from "@base-ui/react/menu"
import {
  CaretDownIcon,
  CheckIcon,
  FunnelSimpleIcon,
} from "@phosphor-icons/react"

interface StatusOption<Value extends string> {
  readonly value: Value
  readonly label: string
}

export function StatusFilter<Value extends string>({
  disabled = false,
  onChange,
  options,
  selectedValues,
}: {
  readonly disabled?: boolean
  readonly onChange: (values: readonly Value[]) => void
  readonly options: readonly StatusOption<Value>[]
  readonly selectedValues: readonly Value[]
}) {
  function changeSelection(value: Value, checked: boolean) {
    if (!checked && selectedValues.length === 1) return

    onChange(checked
      ? options
          .filter((option) => option.value === value || selectedValues.includes(option.value))
          .map((option) => option.value)
      : selectedValues.filter((selected) => selected !== value))
  }

  return (
    <Menu.Root disabled={disabled}>
      <Menu.Trigger
        className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        type="button"
      >
        <FunnelSimpleIcon aria-hidden="true" size={16} />
        Status
        <CaretDownIcon aria-hidden="true" size={14} weight="bold" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" className="z-50" sideOffset={6}>
          <Menu.Popup className="min-w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none transition-[transform,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {options.map((option) => {
              const selected = selectedValues.includes(option.value)

              return (
                <Menu.CheckboxItem
                  checked={selected}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-highlighted:bg-accent"
                  disabled={selected && selectedValues.length === 1}
                  key={option.value}
                  onCheckedChange={(checked) => changeSelection(option.value, checked)}
                >
                  <span className={`grid size-4 place-items-center rounded border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>
                    {selected ? <CheckIcon aria-hidden="true" size={12} weight="bold" /> : null}
                  </span>
                  {option.label}
                </Menu.CheckboxItem>
              )
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
