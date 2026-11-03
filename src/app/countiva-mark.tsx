import { useId } from "react";
import { brandPath } from "../lib/brand-assets";

export default function CountivaMark({
  size = 40,
  inverse = false,
  className = "",
}: {
  size?: number;
  inverse?: boolean;
  className?: string;
}) {
  const gradient = `countiva-${useId().replace(/:/g, "")}`;
  return (
    <svg
      className={`countiva-mark ${inverse ? "inverse" : ""} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradient} x1=".85" y1="0" x2=".15" y2="1">
          <stop className="brand-stop-1" />
          <stop className="brand-stop-2" offset=".5" />
          <stop className="brand-stop-3" offset="1" />
        </linearGradient>
      </defs>
      <path
        d={brandPath}
        fill="none"
        stroke={`url(#${gradient})`}
        strokeWidth="16"
      />
      <circle cx="50" cy="50" r="13" fill={`url(#${gradient})`} />
    </svg>
  );
}
