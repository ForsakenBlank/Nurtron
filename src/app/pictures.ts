// turning an image file into a picture for a shape: small enough to save, and with a colour a creature can see.
import { mostlyColour } from '../sim/senses.ts';
import type { Colour } from '../sim/senses.ts';
import { TEXTURE_PIXELS } from '../sim/textures.ts';

const MOST_FILE_BYTES = 30_000_000;

export async function readPicture(file: File): Promise<{ data: string; colour: Colour }> {
  // svg could carry scripts, so it isn't allowed in, whatever else the browser can open
  if (file.type === 'image/svg+xml' || file.size > MOST_FILE_BYTES) throw new Error("That picture can't be used. PNG, JPEG or WebP, under 30MB.");
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error("That picture couldn't be opened.");
  }
  const scale = Math.min(1, TEXTURE_PIXELS / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const colour = mostlyColour(context.getImageData(0, 0, canvas.width, canvas.height).data);
  return { data: canvas.toDataURL('image/webp', 0.85), colour };
}
