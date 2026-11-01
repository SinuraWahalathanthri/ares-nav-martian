import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Panel } from './Panel'

/** Modal built on native <dialog>: focus trapping, Esc to close and the backdrop come from the browser. */
export function Dialog({
  open,
  onClose,
  legend,
  title,
  children,
  actions,
}: {
  open: boolean
  onClose: () => void
  legend: string
  title: string
  children: ReactNode
  actions: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose}>
      <Panel legend={legend}>
        <h3 id={titleId} style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--fs-4)' }}>
          {title}
        </h3>
        {children}
        <div className="dialog__actions">{actions}</div>
      </Panel>
    </dialog>
  )
}
