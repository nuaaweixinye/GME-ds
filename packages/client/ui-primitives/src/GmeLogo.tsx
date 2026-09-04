import type { IconProps } from './icons/props.ts'

/** Public web asset used by the GME-branded Harness surfaces. */
export const GME_LOGO_SRC = '/gme-logo.png'

/**
 * Render the GME mark cropped from the full square logo.
 * @param props.size - square edge in px (default 24).
 * @param props.className - extra class for layout placement.
 * @returns the GME logo mark.
 */
export function GmeLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
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
