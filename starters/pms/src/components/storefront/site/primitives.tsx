import type React from "react"

/**
 * Presentational primitives for the Acme storefront shell. Small,
 * class-driven wrappers over the `.acme-*` design tokens declared in
 * `styles.css` so pages compose a consistent rhythm (container width,
 * section spacing, serif headings, the brass accent) without repeating
 * utility soup.
 */

export function Container({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}): React.ReactElement {
  return <div className={`acme-container ${className}`}>{children}</div>
}

type SectionTone = "paper" | "deep" | "surface" | "ink"

const SECTION_TONE: Record<SectionTone, string> = {
  paper: "bg-[var(--acme-paper)] text-[var(--acme-ink)]",
  deep: "bg-[var(--acme-paper-deep)] text-[var(--acme-ink)]",
  surface: "bg-[var(--acme-surface)] text-[var(--acme-ink)]",
  ink: "bg-[var(--acme-ink)] text-[var(--acme-paper)]",
}

export function Section({
  children,
  tone = "paper",
  className = "",
  id,
}: {
  children: React.ReactNode
  tone?: SectionTone
  className?: string
  id?: string
}): React.ReactElement {
  return (
    <section id={id} className={`${SECTION_TONE[tone]} py-20 sm:py-24 ${className}`}>
      {children}
    </section>
  )
}

/**
 * Padded, paper-ground wrapper for "document"-style storefront pages
 * (property detail, booking journey, confirmation) that render inside
 * the shell rather than as full-bleed marketing sections.
 */
export function StorefrontDocument({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}): React.ReactElement {
  return (
    <div className="bg-[var(--acme-paper)]">
      <Container className={`py-12 sm:py-16 ${className}`}>{children}</Container>
    </div>
  )
}

export function Eyebrow({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}): React.ReactElement {
  return <p className={`acme-eyebrow ${className}`}>{children}</p>
}

export function SectionHeading({
  children,
  as = "h2",
  className = "",
}: {
  children: React.ReactNode
  as?: "h1" | "h2" | "h3"
  className?: string
}): React.ReactElement {
  const Tag = as
  return (
    <Tag className={`acme-serif text-balance text-3xl leading-[1.1] sm:text-4xl ${className}`}>
      {children}
    </Tag>
  )
}

/**
 * Star rating rendered as filled/empty glyphs in the brass accent.
 * Falls back to nothing when the rating is absent.
 */
export function Stars({
  rating,
  className = "",
}: {
  rating: number | null | undefined
  className?: string
}): React.ReactElement | null {
  if (!rating || rating < 1) return null
  const filled = Math.round(rating)
  const positions = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"].slice(0, filled)
  return (
    <span
      role="img"
      className={`inline-flex items-center gap-0.5 text-[var(--acme-accent)] ${className}`}
      aria-label={`${filled}-star hotel`}
    >
      {positions.map((k) => (
        <span key={k} aria-hidden="true" className="text-[0.7em] leading-none">
          ★
        </span>
      ))}
    </span>
  )
}
