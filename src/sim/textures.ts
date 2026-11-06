// pictures on shapes. a picture is only ever data, so files can carry them safely: it has to really be one of a few
// plain image formats. svg is left out on purpose, because an svg can contain scripts.
const MOST_ONE_TEXTURE = 300_000; // characters of text, so about 220KB of picture
export const MOST_TEXTURE_TEXT = 2_500_000; // for a whole world, since it all has to fit in the save
export const TEXTURE_PIXELS = 128; // pictures are shrunk to this when added, which is plenty for a shape

const FORMAT = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const SIGNATURES: Record<string, (bytes: string) => boolean> = {
  png: (b) => b.startsWith('\x89PNG\r\n\x1a\n'),
  jpeg: (b) => b.startsWith('\xff\xd8\xff'),
  webp: (b) => b.startsWith('RIFF') && b.slice(8, 12) === 'WEBP',
};

export function usableTexture(data: unknown): data is string {
  if (typeof data !== 'string' || data.length > MOST_ONE_TEXTURE) return false;
  const format = FORMAT.exec(data)?.[1];
  if (!format) return false;
  try {
    return SIGNATURES[format](atob(data.slice(data.indexOf(',') + 1, data.indexOf(',') + 33)));
  } catch {
    return false;
  }
}

// goes by what's in the picture, so the same picture is only ever kept once, and a file can't mislabel one
export function textureId(data: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b + c, 0x5bd1e995) ^ (b >>> 13);
  }
  return `t${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
}
