import type { ImageMetadata } from 'astro';

/**
 * Covers downloaded by the content loader, resolved so Astro's image pipeline
 * can optimise them.
 *
 * The glob is what turns a plain file on disk into an `ImageMetadata` Astro
 * will transform. It is evaluated during the page build, which runs after the
 * content loaders — that ordering is what makes files fetched a moment earlier
 * in the same build visible here.
 */
const covers = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/blog/*.{jpeg,jpg,png,gif,webp,avif,svg}',
);

const COVER_PREFIX = '/src/assets/blog/';

export async function resolveCover(file: string): Promise<ImageMetadata> {
  const importer = covers[`${COVER_PREFIX}${file}`];
  if (!importer) {
    throw new Error(
      `Blog cover "${file}" was not found in src/assets/blog/. The content loader downloads ` +
        `covers before pages are built, so this usually means the file was removed mid-build ` +
        `— or, in dev, that the module graph predates the download and the server needs a restart.`,
    );
  }
  return (await importer()).default;
}

/**
 * Widths to generate, never above the original: upscaling costs bytes and buys
 * nothing.
 */
export function coverWidths(image: ImageMetadata, candidates: number[]): number[] {
  const usable = candidates.filter((width) => width <= image.width);
  return usable.length > 0 ? usable : [image.width];
}
