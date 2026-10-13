/**
 * Supplied Figma-kit artwork (frontend/public/brand/hero-icons), inlined so
 * floating cards can paint it in brand colours. Path data, viewBox, and
 * aspect ratios are exactly as supplied — only the fill is themed.
 */
function Base({ d, ...rest }: { d: string } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...rest}>
      <path fillRule="evenodd" clipRule="evenodd" d={d} fill="currentColor" />
    </svg>
  );
}

const CLOCK_D =
  "M16.034 14.401C15.894 14.636 15.645 14.767 15.389 14.767C15.259 14.767 15.126 14.733 15.006 14.662L11.615 12.639C11.388 12.504 11.249 12.258 11.249 11.995V7.633C11.249 7.219 11.585 6.883 11.999 6.883C12.413 6.883 12.749 7.219 12.749 7.633V11.569L15.774 13.373C16.13 13.586 16.246 14.046 16.034 14.401ZM12 2.25C4.801 2.25 2.25 4.801 2.25 12C2.25 19.198 4.801 21.75 12 21.75C19.199 21.75 21.75 19.198 21.75 12C21.75 4.801 19.199 2.25 12 2.25Z";

const CHECK_D =
  "M16.091 10.157L11.341 14.903C11.2 15.044 11.01 15.123 10.811 15.123C10.612 15.123 10.421 15.044 10.28 14.903L7.909 12.53C7.616 12.237 7.616 11.762 7.909 11.469C8.203 11.176 8.678 11.178 8.97 11.469L10.811 13.312L15.03 9.096C15.323 8.803 15.798 8.804 16.091 9.096C16.384 9.389 16.384 9.864 16.091 10.157ZM12 2.25C4.802 2.25 2.25 4.802 2.25 12C2.25 19.198 4.802 21.75 12 21.75C19.198 21.75 21.75 19.198 21.75 12C21.75 4.802 19.198 2.25 12 2.25Z";

const CUBE_D =
  "M15.618 9.228L14.201 13.756C14.135 13.968 13.969 14.134 13.758 14.2L9.228 15.618C9.161 15.639 9.094 15.649 9.026 15.649C8.85 15.649 8.677 15.58 8.548 15.451C8.371 15.274 8.306 15.012 8.381 14.772L9.799 10.242C9.865 10.03 10.031 9.865 10.242 9.799L14.772 8.382C15.012 8.305 15.274 8.371 15.451 8.549C15.629 8.727 15.693 8.989 15.618 9.228ZM12 2.25C4.801 2.25 2.25 4.802 2.25 12C2.25 19.198 4.801 21.75 12 21.75C19.199 21.75 21.75 19.198 21.75 12C21.75 4.802 19.198 2.25 12 2.25Z";

export function ClockGlyph(props: React.SVGProps<SVGSVGElement>) {
  return <Base d={CLOCK_D} {...props} />;
}

export function CheckGlyph(props: React.SVGProps<SVGSVGElement>) {
  return <Base d={CHECK_D} {...props} />;
}

export function CubeGlyph(props: React.SVGProps<SVGSVGElement>) {
  return <Base d={CUBE_D} {...props} />;
}
