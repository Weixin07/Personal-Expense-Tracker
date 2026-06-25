import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SRC = new URL('./assets/logo.png', import.meta.url).pathname.replace(/^\//, '');
const RES = 'C:/PET/android/app/src/main/res';
const BACKGROUND = '#D32F2F';

// Fraction of each tile the artwork occupies.
// Adaptive: 0.60 keeps all art inside the 66/108dp guaranteed safe zone (no mask clips it).
// Legacy square: small red frame. Legacy round: <= 1/sqrt(2) so square art fits the circle.
const ADAPTIVE_FRACTION = 0.6;
const LEGACY_SQUARE_FRACTION = 0.86;
const LEGACY_ROUND_FRACTION = 0.7;

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const ADAPTIVE_DP = 108;
const LEGACY_DP = 48;

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const rgb = hexToRgb(BACKGROUND);

const px = (dp, scale) => Math.round(dp * scale);

const fittedLogo = (side) =>
  sharp(SRC).resize(side, side, { fit: 'inside' }).png().toBuffer();

const write = async (relPath, buffer) => {
  const out = join(RES, relPath);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buffer);
  console.log('wrote', relPath);
};

const squareCanvas = (size, alpha) =>
  sharp({
    create: { width: size, height: size, channels: 4, background: { ...rgb, alpha } },
  });

const circleBg = (size) =>
  Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${BACKGROUND}"/></svg>`,
  );

for (const [density, scale] of Object.entries(DENSITIES)) {
  const dir = `mipmap-${density}`;

  const fgSize = px(ADAPTIVE_DP, scale);
  const fg = await fittedLogo(px(ADAPTIVE_DP * ADAPTIVE_FRACTION, scale));
  await write(
    `${dir}/ic_launcher_foreground.png`,
    await squareCanvas(fgSize, 0)
      .composite([{ input: fg, gravity: 'center' }])
      .png()
      .toBuffer(),
  );

  const legSize = px(LEGACY_DP, scale);
  const legLogo = await fittedLogo(px(LEGACY_DP * LEGACY_SQUARE_FRACTION, scale));
  await write(
    `${dir}/ic_launcher.png`,
    await squareCanvas(legSize, 1)
      .composite([{ input: legLogo, gravity: 'center' }])
      .png()
      .toBuffer(),
  );

  const roundLogo = await fittedLogo(px(LEGACY_DP * LEGACY_ROUND_FRACTION, scale));
  await write(
    `${dir}/ic_launcher_round.png`,
    await sharp(circleBg(legSize))
      .composite([{ input: roundLogo, gravity: 'center' }])
      .png()
      .toBuffer(),
  );
}

const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
await write('mipmap-anydpi-v26/ic_launcher.xml', Buffer.from(adaptiveXml));
await write('mipmap-anydpi-v26/ic_launcher_round.xml', Buffer.from(adaptiveXml));

await write(
  'values/ic_launcher_background.xml',
  Buffer.from(
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BACKGROUND}</color>
</resources>
`,
  ),
);

console.log('done');
