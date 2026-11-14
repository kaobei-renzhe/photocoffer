interface LogoProps {
  size?: number
  className?: string
}

/**
 * 存照的品牌标：俯视的匣里插着照片。
 * 与 build/icon-win.png 同源，但在小尺寸下自动省略细节（山形、渐变、内高光），
 * 避免 28px 时糊成一片。
 */
export default function Logo({ size = 28, className = '' }: LogoProps) {
  const detailed = size >= 44
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      aria-label="存照"
      role="img"
    >
      <defs>
        <linearGradient id="px-logo-case" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#F7FAFC" />
          <stop offset="0.55" stopColor="#E8EEF4" />
          <stop offset="1" stopColor="#D3DCE6" />
        </linearGradient>
      </defs>

      {/* 方形圆角底 */}
      <rect width="512" height="512" rx="87" fill="#14161B" />

      {/* 匣壁 */}
      <rect x="51" y="51" width="410" height="410" rx="38" fill="url(#px-logo-case)" />
      {detailed && (
        <rect
          x="59"
          y="59"
          width="394"
          height="394"
          rx="34"
          fill="none"
          stroke="#FFFDF7"
          strokeOpacity="0.45"
          strokeWidth="3"
        />
      )}

      {/* 内凹 */}
      <rect x="79" y="79" width="354" height="354" rx="18" fill="#2A2E36" />
      <rect x="79" y="79" width="354" height="23" rx="11" fill="#000" opacity="0.2" />

      {/* 三张照片：小尺寸只保留主体那张 */}
      {detailed && (
        <>
          <g transform="rotate(-17 202 240)">
            <rect x="120" y="120" width="176" height="240" rx="6" fill="#F6EEDB" />
            <rect x="133" y="133" width="150" height="180" rx="3" fill="#5B9FE8" />
          </g>
          <g transform="rotate(14 300 228)">
            <rect x="212" y="108" width="176" height="240" rx="6" fill="#F6EEDB" />
            <rect x="225" y="121" width="150" height="180" rx="3" fill="#F5C344" />
          </g>
        </>
      )}

      {/* 主体照片：珊瑚红 */}
      <rect x="168" y="140" width="176" height="232" rx="6" fill="#F6EEDB" />
      <rect x="181" y="153" width="150" height="176" rx="3" fill="#F2604A" />
      {detailed && (
        <path
          d="M 181 329 L 241 227 L 274 290 L 301 240 L 331 329 Z"
          fill="#14161B"
          opacity="0.24"
        />
      )}
    </svg>
  )
}
