const Logo = ({ showText = true, className = '', textClassName = '' }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-label="Adityanta logo">
      <svg
        viewBox="0 0 160 120"
        className="h-12 w-auto"
        role="img"
        aria-hidden="true"
      >
        <g fill="none" fillRule="evenodd">
          <circle cx="80" cy="44" r="24" fill="#F57C00" opacity="0.14" />
          <circle cx="80" cy="44" r="18" fill="#F57C00" />
          <g stroke="#F57C00" strokeWidth="5" strokeLinecap="round">
            <path d="M80 11v12" />
            <path d="M97 15l-5 11" />
            <path d="M63 15l5 11" />
            <path d="M108 25l-9 9" />
            <path d="M52 25l9 9" />
            <path d="M114 38h-12" />
            <path d="M46 38h12" />
          </g>
          <path
            d="M48 54h64v13c0 13.255-10.745 24-24 24H72c-13.255 0-24-10.745-24-24V54Z"
            fill="#0A7A3C"
          />
          <rect x="70" y="60" width="6" height="22" rx="2" fill="#FBEADA" />
          <rect x="82" y="60" width="6" height="22" rx="2" fill="#FBEADA" />
          <rect x="58" y="60" width="6" height="22" rx="2" fill="#FBEADA" />
          <path d="M60 91h40" stroke="#0A7A3C" strokeWidth="5" strokeLinecap="round" />
        </g>
      </svg>
      {showText && (
        <span className={`font-black text-[#0A7A3C] leading-none text-[28px] tracking-tight ${textClassName}`}>
          Adityanta
        </span>
      )}
    </div>
  )
}

export default Logo
