import { ImageResponse } from 'next/og';

export const alt = 'Preflight — see and fix your AI coding setup';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// The plane mark (assets/brand/icon.svg) on the dark brand ground,
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
          background: '#050a1a',
          color: '#e6edf7',
          overflow: 'hidden',
        }}
      >
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: 'absolute', inset: 0 }}>
          {rings.map((r) => (
            <circle key={r} cx="930" cy="300" r={r} fill="none" stroke="#8fb8ff" strokeOpacity="0.22" strokeWidth="2" />
          ))}
          <path d="M560 300 H1300 M930 -80 V680" stroke="#8fb8ff" strokeOpacity="0.16" strokeWidth="2" />
          <path d="M0 480 L1200 400" stroke="#8fb8ff" strokeOpacity="0.5" strokeWidth="3" />
          <path d="M0 480 L1200 400 L1200 630 L0 630Z" fill="#8fb8ff" fillOpacity="0.07" />
          <path d="M930 300 L1180 150 A292 292 0 0 0 930 8Z" fill="#8fb8ff" fillOpacity="0.14" />
          <circle cx="1040" cy="210" r="9" fill="#f0a04a" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 80px', width: 860 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <svg width="72" height="72" viewBox="0 0 1024 1024">
              <rect width="1024" height="1024" rx="232" fill="#0c2d5e" />
              <g transform="translate(548 476) rotate(45)">
                <path fill="#f4f7fb" d="M0 -340 C34 -340 46 -300 46 -255 L46 -80 L340 70 L340 135 L46 55 L46 205 L135 275 L135 318 L0 288 L-135 318 L-135 275 L-46 205 L-46 55 L-340 135 L-340 70 L-46 -80 L-46 -255 C-46 -300 -34 -340 0 -340 Z" />
                <circle cx="340" cy="102" r="30" fill="#f0a04a" />
              </g>
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
