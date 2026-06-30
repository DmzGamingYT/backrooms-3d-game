/**
 * Ambient backdrop = four soft radial-gradient blobs drifting on slow
 * Lissajous curves + an SVG fractal-noise grain overlay. Both layers are
 * pointer-events-none so the UI always wins on hit testing.
 *
 * Implementation note: pure CSS over WebGL so the GPU stays free for the
 * VoiceOrb's audio-reactive ring. Cost is three blurred repaints of the
 * background per second — acceptable on any laptop from the last 6 years.
 */
export function Aurora() {
  return (
    <>
      {/* Aurora blobs */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
        style={{ background: "var(--c-bg-deep)" }}
      >
        <div className="aurora-blob aurora-a" />
        <div className="aurora-blob aurora-b" />
        <div className="aurora-blob aurora-c" />
        <div className="aurora-blob aurora-d" />
      </div>

      {/* Subtle film grain via SVG turbulence — cheap, crisp, infinite. */}
      <svg
        aria-hidden
        className="fixed inset-0 w-full h-full pointer-events-none mix-blend-overlay opacity-[0.06] -z-[5]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="solis-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#solis-noise)" />
      </svg>
    </>
  );
}
