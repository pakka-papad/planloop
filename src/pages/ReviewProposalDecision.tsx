import { Dialog } from "@base-ui/react/dialog"
import { Menu } from "@base-ui/react/menu"
import {
  CaretDownIcon,
  CheckCircleIcon,
  CheckIcon,
  XCircleIcon,
} from "@phosphor-icons/react"
import { useEffect, useState, type FormEvent } from "react"

import { errorMessage } from "../api/client"
import {
  decideReviewProposal,
  type ReviewProposalDecision,
  type VersionedReviewProposal,
} from "../api/review-proposals"

type Decision = ReviewProposalDecision["decision"]

const presentation: Record<Decision, {
  readonly action: string
  readonly description: string
  readonly submitLabel: string
  readonly title: string
}> = {
  approved: {
    action: "Approve and publish",
    description: "This publishes the proposed plan as its next immutable version.",
    submitLabel: "Approve and publish",
    title: "Approve this proposal?",
  },
  rejected: {
    action: "Reject",
    description: "No new action plan version will be created. Add a comment explaining the decision.",
    submitLabel: "Reject proposal",
    title: "Reject this proposal?",
  },
}

export function ReviewProposalDecisionButton({
  disabled,
  etag,
  onDecided,
  proposalId,
}: {
  readonly disabled: boolean
  readonly etag: string
  readonly onDecided: (resource: VersionedReviewProposal) => void
  readonly proposalId: string
}) {
  const [decision, setDecision] = useState<Decision>("approved")
  const [open, setOpen] = useState(false)
  const [comment, setComment] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const content = presentation[decision]
  const isApproval = decision === "approved"

  useEffect(() => setDecision("approved"), [proposalId])

  function changeOpen(nextOpen: boolean) {
    if (isSubmitting) return
    if (nextOpen) {
      setComment("")
      setError(null)
    }
    setOpen(nextOpen)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedComment = comment.trim()

    if (!isApproval && trimmedComment.length === 0) {
      setError("A rejection comment is required.")
      return
    }

    setError(null)
    setIsSubmitting(true)

    const request: ReviewProposalDecision = isApproval
      ? { decision, ...(trimmedComment === "" ? {} : { comment: trimmedComment }) }
      : { decision, comment: trimmedComment }

    try {
      const resource = await decideReviewProposal(proposalId, etag, request)
      setOpen(false)
      onDecided(resource)
    } catch (cause) {
      setError(errorMessage(cause))
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog.Root onOpenChange={changeOpen} open={open}>
      <div className="inline-flex shrink-0">
        <Dialog.Trigger
          className={isApproval
            ? "inline-flex cursor-pointer items-center gap-2 rounded-l-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            : "inline-flex cursor-pointer items-center gap-2 rounded-l-md bg-destructive px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"}
          disabled={disabled}
          title={disabled ? "Save or cancel the current edit before deciding" : undefined}
          type="button"
        >
          {isApproval ? <CheckCircleIcon aria-hidden="true" size={17} /> : <XCircleIcon aria-hidden="true" size={17} />}
          {content.action}
        </Dialog.Trigger>
        <Menu.Root>
          <Menu.Trigger
            aria-label="Choose proposal decision"
            className={isApproval
              ? "grid cursor-pointer place-items-center rounded-r-md border-l border-primary-foreground/25 bg-primary px-2.5 text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              : "grid cursor-pointer place-items-center rounded-r-md border-l border-white/25 bg-destructive px-2.5 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"}
            disabled={disabled}
            type="button"
          >
            <CaretDownIcon aria-hidden="true" size={15} weight="bold" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner align="end" className="z-50" sideOffset={6}>
              <Menu.Popup className="min-w-52 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none transition-[transform,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
                {(["approved", "rejected"] as const).map((option) => (
                  <Menu.Item
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-accent"
                    key={option}
                    onClick={() => setDecision(option)}
                  >
                    {option === "approved"
                      ? <CheckCircleIcon aria-hidden="true" className="text-primary" size={17} />
                      : <XCircleIcon aria-hidden="true" className="text-destructive" size={17} />}
                    <span className="flex-1">{presentation[option].action}</span>
                    {decision === option ? <CheckIcon aria-hidden="true" size={15} weight="bold" /> : null}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
          <Dialog.Popup className="w-full max-w-lg rounded-xl border bg-popover p-6 text-popover-foreground shadow-xl outline-none transition-[transform,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <form onSubmit={(event) => void submit(event)}>
              <Dialog.Title className="text-lg font-semibold">{content.title}</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                {content.description}
              </Dialog.Description>
              <label className="mt-5 block text-sm font-semibold" htmlFor={`${decision}-decision-comment`}>
                Comment {isApproval ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
              </label>
              <textarea
                autoFocus={!isApproval}
                className="mt-2 min-h-28 w-full resize-y rounded-md border bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring/40"
                disabled={isSubmitting}
                id={`${decision}-decision-comment`}
                maxLength={1000}
                onChange={(event) => setComment(event.target.value)}
                placeholder={isApproval ? "Add context for this decision" : "Explain why this proposal is being rejected"}
                required={!isApproval}
                value={comment}
              />
              <div className="mt-1 text-right text-xs text-muted-foreground">{comment.length}/1000</div>
              {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
              <div className="mt-6 flex justify-end gap-2">
                <Dialog.Close
                  className="cursor-pointer rounded-md border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSubmitting}
                  type="button"
                >
                  Cancel
                </Dialog.Close>
                <button
                  className={isApproval
                    ? "cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    : "cursor-pointer rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"}
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Saving decision…" : content.submitLabel}
                </button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
