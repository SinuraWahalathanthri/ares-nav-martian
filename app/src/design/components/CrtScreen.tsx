import { useEffect, useState, type ReactNode } from 'react'

export type Phosphor = 'amber' | 'green'

/**
 * CRT glass set into the panel. Plays the power-on sweep once when it mounts
 * (only with full FX; reduced FX and prefers-reduced-motion skip it).
 */
export function CrtScreen({
  phosphor = 'amber',
  children,
  className = '',
  label,
}: {
  phosphor?: Phosphor
  children: ReactNode
  className?: string
  label?: string
}) {
  const [powering, setPowering] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setPowering(false), 950)
    return () => clearTimeout(t)
  }, [])
  return (
    <div
      className={`crt crt--${phosphor} ${powering ? 'crt--powering' : ''} ${className}`}
      role="region"
      aria-label={label}
    >
      <div className="crt__glass">
        <div className="crt__content">{children}</div>
      </div>
    </div>
  )
}
