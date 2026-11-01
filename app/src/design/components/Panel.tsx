import type { ReactNode } from 'react'

/** Painted-metal module with an engraved legend and corner screws. */
export function Panel({ legend, children, className = '' }: { legend?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`} aria-label={legend}>
      {legend && (
        <h2 className="panel__legend" aria-hidden="true">
          {legend}
        </h2>
      )}
      <span className="screw screw--tl" aria-hidden="true" />
      <span className="screw screw--tr" aria-hidden="true" />
      <span className="screw screw--bl" aria-hidden="true" />
      <span className="screw screw--br" aria-hidden="true" />
      {children}
    </section>
  )
}
