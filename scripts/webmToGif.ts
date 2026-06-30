/**
 * Convertit une vidéo WebM capturée par Playwright en GIF optimisé.
 * Utilise palettegen + paletteuse pour limiter le banding sur les
 * dégradés d'aurore. Préserve le ratio d'aspect via
 * force_original_aspect_ratio + pad.
 */
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'node:fs/promises';

if (!ffmpegStatic) {
  throw new Error('ffmpeg-static: binaire introuvable (réinstalle le paquet).');
}
ffmpeg.setFfmpegPath(ffmpegStatic as string);

export interface GifOptions {
  fps?: number;
  width?: number;
  height?: number;
  paletteStatsMode?: 'full' | 'diff' | 'single';
  loop?: boolean;
  dither?: 'bayer' | 'sierra2_4a' | 'floyd_steinberg' | 'none';
}

function runFfmpeg(
  build: () => ReturnType<typeof ffmpeg>,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cmd = build();
    cmd.on('end', () => resolve()).on('error', (err: Error) => reject(err));
  });
}

export async function webmToGif(input: string, output: string, opts: GifOptions = {}): Promise<void> {
  const {
    fps = 15,
    width = 800,
    height = 600,
    paletteStatsMode = 'diff',
    loop = true,
    dither = 'sierra2_4a',
  } = opts;

  const paletteFile = output.replace(/\.gif$/, '.palette.png');

  // 1) Génère la palette optimale.
  await runFfmpeg(() =>
    ffmpeg(input).outputOptions([
      '-vf',
      // Préserve le ratio : si source ≠ cible, on upscale/downscale
      // pour couvrir PUIS on pad au noir au centre.
      `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,palettegen=stats_mode=${paletteStatsMode}`,
    ]).save(paletteFile),
  );

  // 2) Ré-encode avec la palette. Dither sierra2_4a produit moins de
  // moiré visible sur les dégradés lents (glassmorphism + aurore).
  const ditherFilter =
    dither === 'none'
      ? 'paletteuse'
      : `paletteuse=dither=${dither}`;

  await runFfmpeg(() =>
    ffmpeg()
      .input(input)
      .input(paletteFile)
      .complexFilter([
        `[0:v]fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black [v]`,
        `[v][1:v]${ditherFilter}`,
      ])
      .outputOptions(['-loop', loop ? '0' : '-1'])
      .save(output),
  );

  await fs.unlink(paletteFile).catch(() => {});
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function fileSizeBytes(p: string): Promise<number> {
  const stat = await fs.stat(p);
  return stat.size;
}
