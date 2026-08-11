import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Olivier Winkler — Software Engineer';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        <h1
          style={{
            fontSize: '64px',
            fontWeight: 600,
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Olivier Winkler
        </h1>
        <p
          style={{
            fontSize: '28px',
            color: 'rgba(255,255,255,0.6)',
            margin: 0,
          }}
        >
          Building Software for the Future.
        </p>
        <p
          style={{
            fontSize: '22px',
            color: '#71BC92',
            margin: 0,
          }}
        >
          frigg.eco
        </p>
      </div>
    </div>,
    { ...size },
  );
}
