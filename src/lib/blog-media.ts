/**
 * Build-time image download for the blog.
 *
 * ⚠️ Images are pulled down during the build and treated as local assets. They
 * are deliberately NOT left remote (no `image.domains` in astro.config): a
 * published page must not need app.sentinely.eu to render, and only a local
 * file can go through Astro's image pipeline (modern formats, multiple sizes).
 *
 * Two destinations, for two different jobs:
 *
 *  - **Covers → `src/assets/blog/`.** Resolved through `import.meta.glob` and
 *    handed to `<Image>`, so Astro optimises and fingerprints them.
 *  - **Images inside the post body → `public/blog-media/`.** The body is
 *    rendered from a Markdown string, so its `<img>` tags are raw HTML with no
 *    import Astro could follow. `public/` is copied verbatim into `dist/`,
 *    which gets us the thing that actually matters — the bytes are ours, and
 *    the reader's browser never calls the product API.
 *
 * Both directories are build output, not sources: they are gitignored and
 * pruned on every run.
 */
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { APP_URL } from '../config';
import { BlogApiError, absoluteMediaUrl, type BlogMedia } from './blog-api';

/** Where covers land, relative to `srcDir`. Must match the glob in the components. */
export const COVER_DIR_NAME = 'assets/blog';
/** Where body images land, relative to `publicDir` — and their public URL prefix. */
export const BODY_MEDIA_DIR_NAME = 'blog-media';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/** Formats Astro's image pipeline can transform. SVG is served as-is instead. */
const OPTIMISABLE = new Set(['jpg', 'png', 'webp', 'avif', 'gif']);

export function isOptimisable(file: string): boolean {
  return OPTIMISABLE.has(path.extname(file).slice(1).toLowerCase());
}

function extensionFor(mimeType: string | null | undefined, url: string): string {
  const normalised = (mimeType ?? '').split(';')[0]!.trim().toLowerCase();
  const known = MIME_EXTENSIONS[normalised];
  if (known) return known;
  throw new BlogApiError(
    `media ${url} has an image type this site cannot handle (${mimeType ?? 'no Content-Type'}). ` +
      `Supported: ${Object.keys(MIME_EXTENSIONS).join(', ')}.`,
    url,
  );
}

async function exists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

/**
 * Fetch one media file into `directory` as `<id>.<ext>`, and return the file
 * name. Written through a temp file and renamed, so a half-written download can
 * never be mistaken for a cached one on the next run.
 */
async function downloadMedia(
  relativeUrl: string,
  mimeTypeHint: string | null,
  directory: string,
  id: string,
): Promise<string> {
  const url = absoluteMediaUrl(relativeUrl);

  // A hinted type lets us name the file before spending the request.
  if (mimeTypeHint) {
    const fileName = `${id}.${extensionFor(mimeTypeHint, url)}`;
    if (await exists(path.join(directory, fileName))) return fileName;
  }

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new BlogApiError(
      `could not download blog image ${url} — ${error instanceof Error ? error.message : String(error)}`,
      url,
      undefined,
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new BlogApiError(
      `blog image ${url} answered ${response.status} ${response.statusText}`,
      url,
      response.status,
    );
  }

  const fileName = `${id}.${extensionFor(mimeTypeHint ?? response.headers.get('content-type'), url)}`;
  const destination = path.join(directory, fileName);
  const temporary = `${destination}.${process.pid}.part`;
  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.byteLength === 0) {
    throw new BlogApiError(`blog image ${url} came back empty`, url);
  }

  await mkdir(directory, { recursive: true });
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
  return fileName;
}

export interface DownloadedCover {
  /** File name inside `src/assets/blog/`. */
  file: string;
  /** From the API. `null` means decorative — better than a description we invented. */
  alt: string | null;
  /**
   * As reported by the API, where it could measure the file. `null` is not `0`:
   * we pass it through untouched and let the CSS hold the space. The rendered
   * `<img>` gets its real dimensions from the downloaded file itself, which is
   * a measurement, not a guess.
   */
  width: number | null;
  height: number | null;
}

export async function downloadCover(media: BlogMedia, srcDir: URL): Promise<DownloadedCover> {
  const directory = path.join(fileURLToPath(srcDir), COVER_DIR_NAME);
  const file = await downloadMedia(media.url, media.mimeType, directory, media.id);
  return { file, alt: media.alt, width: media.width, height: media.height };
}

/** `/api/v1/blog/media/<id>`, either bare or on the product origin. */
const MEDIA_URL_PATTERN = new RegExp(
  `(?:${APP_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})?/api/v1/blog/media/([A-Za-z0-9_-]+)`,
  'g',
);

/**
 * Rewrite every product-API image URL in a Markdown body to a local one,
 * downloading the bytes on the way.
 *
 * Without this, an author who drops an image into an article publishes a page
 * that phones home to app.sentinely.eu on every view — the one thing the whole
 * build-time design exists to avoid.
 */
export async function localiseBodyImages(
  markdown: string,
  publicDir: URL,
): Promise<{ markdown: string; files: string[] }> {
  const matches = [...markdown.matchAll(MEDIA_URL_PATTERN)];
  if (matches.length === 0) return { markdown, files: [] };

  const directory = path.join(fileURLToPath(publicDir), BODY_MEDIA_DIR_NAME);
  const replacements = new Map<string, string>();
  const files: string[] = [];

  for (const match of matches) {
    const original = match[0];
    if (replacements.has(original)) continue;
    // No mimeType here — the Markdown carries a bare URL, so the response's
    // Content-Type is the only thing that can name the format.
    const file = await downloadMedia(original, null, directory, match[1]!);
    replacements.set(original, `/${BODY_MEDIA_DIR_NAME}/${file}`);
    files.push(file);
  }

  const rewritten = markdown.replace(MEDIA_URL_PATTERN, (original) => replacements.get(original) ?? original);
  return { markdown: rewritten, files };
}

/**
 * Delete downloaded files this build did not ask for, so a post that loses its
 * cover does not leave the old image sitting in `dist/`.
 */
export async function pruneMedia(directory: URL, dirName: string, keep: Set<string>): Promise<void> {
  const target = path.join(fileURLToPath(directory), dirName);
  let entries: string[];
  try {
    entries = await readdir(target);
  } catch {
    return; // nothing downloaded yet
  }
  await Promise.all(
    entries
      .filter((entry) => !keep.has(entry))
      .map((entry) => rm(path.join(target, entry), { force: true })),
  );
}
