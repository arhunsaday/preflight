import { ImageResponse } from 'next/og';

export const alt = 'Preflight — see and fix your AI coding setup';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// The attitude-indicator mark (assets/brand/logo.svg) on the dark brand ground,
// with a horizon and range rings drawn in the same ink as the site background.
export default function Image() {
  const rings = [150, 260, 370];
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#0c1217',
          color: '#e4e9ec',
          overflow: 'hidden',
        }}
      >
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: 'absolute', inset: 0 }}>
          {rings.map((r) => (
            <circle key={r} cx="930" cy="300" r={r} fill="none" stroke="#4fb3bd" strokeOpacity="0.22" strokeWidth="2" />
          ))}
          <path d="M560 300 H1300 M930 -80 V680" stroke="#4fb3bd" strokeOpacity="0.16" strokeWidth="2" />
          <path d="M0 480 L1200 400" stroke="#4fb3bd" strokeOpacity="0.5" strokeWidth="3" />
          <path d="M0 480 L1200 400 L1200 630 L0 630Z" fill="#4fb3bd" fillOpacity="0.07" />
          <path d="M930 300 L1180 150 A292 292 0 0 0 930 8Z" fill="#4fb3bd" fillOpacity="0.14" />
          <circle cx="1040" cy="210" r="9" fill="#f0a04a" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 80px', width: 860 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <svg width="70" height="74" viewBox="88 24 848 896">
              <clipPath id="d">
                <circle cx="512" cy="540" r="372" />
              </clipPath>
              <g clipPath="url(#d)">
                <rect width="1024" height="1024" fill="#13707a" />
                <path d="M0 676 L1024 500 L1024 1024 L0 1024Z" fill="#0a3b43" />
              </g>
              <path d="M512 52 L570 134 L454 134Z" fill="#f0a04a" stroke="#f0a04a" strokeWidth="24" strokeLinejoin="round" />
              <path d="M296 566 L444 700 L768 364" fill="none" stroke="#f3f1ea" strokeWidth="112" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>Preflight</div>
          </div>
          <div style={{ marginTop: 44, fontSize: 76, fontWeight: 800, lineHeight: 1.04, letterSpacing: -3, display: 'flex' }}>
            See and fix your AI coding setup.
          </div>
          <div style={{ marginTop: 32, fontSize: 28, color: '#9aa8b2', display: 'flex' }}>
            Claude Code · Codex · Cursor. Local first.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
