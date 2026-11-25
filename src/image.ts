import { execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';

// Registry images are served as .jpg. Contributors may commit a .png (e.g. the original
// screenshot), and validate converts it to a .jpg next to it and points the yaml at the .jpg.

export const IMAGE_MAX_WIDTH = 1000;
// ffmpeg's JPEG quality scale runs 2 (best) to 31 (worst). 2 keeps UI text and thin lines sharp,
// which matters for plugin screenshots far more than the few KB it costs (#589).
export const IMAGE_JPG_QUALITY = 2;

export function jpgPathFor(imagePath: string): string {
  return imagePath.replace(/\.png$/i, '.jpg');
}

// Convert a PNG to JPEG, capped at IMAGE_MAX_WIDTH. JPEG has no alpha channel, so any
// transparency is composited onto neutral mid-grey (the same as fetch.ts), not black.
export function convertPngToJpg(srcPath: string, destPath: string): void {
  execFileSync(
    'ffmpeg',
    [
      '-i',
      srcPath,
      '-f',
      'lavfi',
      '-i',
      'color=c=0x808080:s=4x4',
      '-filter_complex',
      `[1:v][0:v]scale2ref[bg][img];[bg][img]overlay=format=auto,scale='min(${IMAGE_MAX_WIDTH},iw)':-1`,
      '-q:v',
      String(IMAGE_JPG_QUALITY),
      '-frames:v',
      '1',
      '-update',
      '1',
      '-y',
      destPath,
    ],
    { stdio: 'pipe' },
  );
}

// Point the yaml's `image:` field at the .jpg, editing only that line so formatting is kept.
export function setYamlImageToJpg(yamlText: string): string {
  return yamlText.replace(/^(image:\s*['"]?\S+?)\.png(['"]?[ \t]*)$/im, '$1.jpg$2');
}

export type PngImageResult =
  { status: 'none' } | { status: 'converted'; pngPath: string; jpgPath: string } | { status: 'error'; message: string };

// Handle a package whose image is (or should be built from) a .png:
// - yaml says .png: convert it to .jpg and update the yaml
// - yaml says .jpg but only the .png exists: convert it
// In CI nothing is written, so a .png in the yaml is an error telling the contributor to run validate locally.
export function resolvePngImage(yamlPath: string, imagePathLocal: string, ci: boolean): PngImageResult {
  const yamlIsPng = /\.png$/i.test(imagePathLocal);
  const pngPath = yamlIsPng ? imagePathLocal : imagePathLocal.replace(/\.jpg$/i, '.png');
  const jpgPath = jpgPathFor(pngPath);
  const needsJpg = yamlIsPng || (!existsSync(jpgPath) && existsSync(pngPath));
  if (!needsJpg) return { status: 'none' };
  if (ci) {
    return {
      status: 'error',
      message: `image must be a .jpg. Run "npm run dev:validate -- ${yamlPath}" locally to convert ${pngPath} and update the yaml`,
    };
  }
  if (!existsSync(pngPath)) return { status: 'error', message: `File does not exist locally: ${pngPath}` };
  convertPngToJpg(pngPath, jpgPath);
  if (yamlIsPng) writeFileSync(yamlPath, setYamlImageToJpg(readFileSync(yamlPath, 'utf8')));
  return { status: 'converted', pngPath, jpgPath };
}
