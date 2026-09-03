export default function LoginIllustration() {
  return (
    <svg
      aria-label="Connected enterprise testing modules illustration"
      className="login-illustration"
      role="img"
      viewBox="0 0 760 500"
    >
      <defs>
        <linearGradient id="windowFill" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dceaff" />
        </linearGradient>
        <linearGradient id="shieldFill" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#2e73ed" />
          <stop offset="1" stopColor="#063a9a" />
        </linearGradient>
        <filter id="illustrationShadow" height="160%" width="160%" x="-30%" y="-30%">
          <feDropShadow dx="0" dy="12" floodColor="#001e5d" floodOpacity=".42" stdDeviation="12" />
        </filter>
        <pattern height="15" id="dotGrid" patternUnits="userSpaceOnUse" width="15">
          <circle cx="2" cy="2" fill="#2980ff" opacity=".24" r="1.2" />
        </pattern>
      </defs>

      <path d="M420 20c115 0 155-64 260-40v238c-96 38-179 8-271 55-90 46-192 48-329 6V130c161 24 219-110 340-110Z" fill="#0d46ad" opacity=".5" />
      <path d="M-40 390c117-95 229-94 337-29 124 74 258 68 493-65v204H-40V390Z" fill="#0d4bb9" opacity=".66" />
      <path d="M-40 421c129-68 237-57 343 3 104 59 235 55 487-81" fill="none" opacity=".28" stroke="#56a0ff" strokeWidth="2" />
      <rect fill="url(#dotGrid)" height="330" width="420" x="340" y="72" />

      <g fill="none" stroke="#27c4ff" strokeDasharray="4 7" strokeLinecap="round" strokeWidth="2.5">
        <path d="M111 232h112" />
        <path d="M119 400h83c30 0 20-44 48-44" />
        <path d="M539 170h53" />
        <path d="M548 276h85" />
        <path d="M532 377h62" />
      </g>
      <g fill="#54ddff">
        <circle cx="197" cy="232" r="4" />
        <circle cx="177" cy="400" r="4" />
        <circle cx="567" cy="170" r="4" />
        <circle cx="602" cy="276" r="4" />
        <circle cx="569" cy="377" r="4" />
      </g>

      <g filter="url(#illustrationShadow)">
        <rect fill="url(#windowFill)" height="225" rx="10" width="360" x="199" y="135" />
        <path d="M199 145a10 10 0 0 1 10-10h340a10 10 0 0 1 10 10v28H199v-28Z" fill="#0750ba" />
        <circle cx="219" cy="154" fill="#7edaff" r="4" />
        <circle cx="234" cy="154" fill="#7edaff" r="4" />
        <circle cx="249" cy="154" fill="#7edaff" r="4" />
        <rect fill="#1a66d8" height="8" rx="4" width="85" x="223" y="191" />
        <rect fill="#8aaee3" height="8" rx="4" width="105" x="379" y="191" />
        <rect fill="#f7fbff" height="128" rx="7" width="215" x="222" y="215" />
        <rect fill="#bed4f2" height="128" rx="7" width="98" x="448" y="215" />
        {[244, 282, 320].map((y) => (
          <g key={y}>
            <circle cx="251" cy={y} fill="#075bd6" r="12" />
            <path d={`m246 ${y} 4 4 7-8`} fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            <rect fill="#bed0e9" height="7" rx="3.5" width="94" x="274" y={y - 6} />
            <rect fill="#d7e2f2" height="6" rx="3" width="71" x="274" y={y + 8} />
          </g>
        ))}
      </g>

      <g filter="url(#illustrationShadow)">
        <rect fill="#0b58c9" height="68" rx="10" width="72" x="67" y="199" />
        <rect fill="#fff" height="36" rx="5" width="53" x="76.5" y="215" />
        <text fill="#0b63ce" fontFamily="Segoe UI, sans-serif" fontSize="19" fontStyle="italic" fontWeight="800" x="84" y="240">SAP</text>

        <g transform="translate(84 378)">
          <ellipse cx="35" cy="8" fill="#2980ed" rx="35" ry="11" />
          <path d="M0 8v47c0 6 16 11 35 11s35-5 35-11V8" fill="#0b5fcf" />
          <path d="M0 24c0 6 16 11 35 11s35-5 35-11M0 42c0 6 16 11 35 11s35-5 35-11" fill="none" stroke="#53a4ff" strokeWidth="2" />
        </g>

        <g transform="translate(592 129)">
          <rect fill="#0d5cca" height="70" rx="10" width="70" />
          <circle cx="35" cy="35" fill="#fff" r="17" />
          <path d="M35 11v8M35 51v8M11 35h8M51 35h8M18 18l6 6M46 46l6 6M52 18l-6 6M24 46l-6 6" stroke="#fff" strokeLinecap="round" strokeWidth="5" />
          <circle cx="35" cy="35" fill="#0d5cca" r="7" />
        </g>

        <g transform="translate(630 241)">
          <rect fill="#0b58c9" height="70" rx="10" width="72" />
          <rect fill="#fff" height="42" rx="4" width="42" x="15" y="14" />
          <path d="M23 26h26M23 44h26" stroke="#0b58c9" strokeWidth="4" />
          <circle cx="50" cy="26" fill="#21b8ff" r="3" />
          <circle cx="50" cy="44" fill="#21b8ff" r="3" />
        </g>

        <g transform="translate(590 351)">
          <rect fill="#0b58c9" height="75" rx="10" width="76" />
          <path d="M18 56V42h8v14M34 56V29h8v27M50 56V19h8v37" fill="#fff" />
        </g>
      </g>

      <g filter="url(#illustrationShadow)" transform="translate(408 250)">
        <path d="M76 0 142 24v51c0 47-26 80-66 99C36 155 10 122 10 75V24L76 0Z" fill="#fff" />
        <path d="M76 12 130 32v43c0 38-20 66-54 83-34-17-54-45-54-83V32l54-20Z" fill="url(#shieldFill)" />
        <path d="m51 79 17 18 37-43" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="11" />
      </g>
    </svg>
  );
}
