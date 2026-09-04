import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

const GME_LOGO_SRC = '/gme-logo.png'

/**
 * Render the official mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the GME mark.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1 1"
      fill="none"
      aria-hidden="true"
    >
      <image
        href={GME_LOGO_SRC}
        x="-0.165"
        y="0"
        width="1.33"
        height="1.33"
        preserveAspectRatio="xMidYMin slice"
      />
    </svg>
  )
}

/**
 * Render the official name artwork without its independently slotted mark.
 * @returns the GME brand name.
 */
export function OfficialBrandName() {
  return (
    <span
      aria-hidden="true"
      style={{
        color: 'currentColor',
        display: 'inline-flex',
        alignItems: 'center',
        height: 24,
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: 0,
        lineHeight: '24px',
      }}
    >
      GME
    </span>
  )
}
