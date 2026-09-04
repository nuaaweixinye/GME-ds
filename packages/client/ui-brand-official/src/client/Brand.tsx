import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { GmeLogo } from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * Render the official mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the GME mark.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <GmeLogo size={size} />
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
