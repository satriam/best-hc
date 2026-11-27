import React from 'react';

/** Posisi/ukuran/durasi partikel tetap (bukan Math.random) supaya SSR dan client sama. */
const PARTICLES = [
  { left: 6, size: 4, dur: 14, delay: 0 },
  { left: 14, size: 2, dur: 18, delay: 3 },
  { left: 23, size: 3, dur: 12, delay: 6 },
  { left: 31, size: 2, dur: 20, delay: 1 },
  { left: 39, size: 5, dur: 16, delay: 8 },
  { left: 47, size: 2, dur: 13, delay: 4 },
  { left: 55, size: 3, dur: 19, delay: 10 },
  { left: 63, size: 2, dur: 15, delay: 2 },
  { left: 71, size: 4, dur: 17, delay: 7 },
  { left: 79, size: 2, dur: 12, delay: 5 },
  { left: 87, size: 3, dur: 21, delay: 9 },
  { left: 94, size: 2, dur: 14, delay: 11 },
];

/** Latar gelap beranimasi untuk halaman auth. Membungkus konten di tengah layar. */
export function AuthBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        {/* Gradien dasar */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950/60 to-slate-950" />

        {/* Blob warna bergerak */}
        <div className="auth-blob absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-indigo-600/30 blur-3xl" />
        <div
          className="auth-blob absolute top-1/3 -right-32 w-[32rem] h-[32rem] rounded-full bg-violet-600/25 blur-3xl"
          style={{ animationDelay: '-6s', animationDuration: '22s' }}
        />
        <div
          className="auth-blob absolute -bottom-40 left-1/4 w-[26rem] h-[26rem] rounded-full bg-sky-500/20 blur-3xl"
          style={{ animationDelay: '-12s', animationDuration: '26s' }}
        />

        {/* Grid bergeser */}
        <div className="auth-grid absolute inset-0" />

        {/* Partikel naik */}
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="auth-particle absolute bottom-[-10px] rounded-full bg-indigo-200/70 shadow-[0_0_8px_rgba(165,180,252,0.8)]"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.dur}s`,
              animationDelay: `-${p.delay}s`,
            }}
          />
        ))}
      </div>

      <div className="auth-card relative z-10 w-full flex justify-center">{children}</div>
    </div>
  );
}
