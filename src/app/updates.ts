// is there a newer Nurtron? the list of versions comes from GitHub. in the desktop app, a version can also be installed,
// newer or older, but only when the player presses its button and says yes. the desktop side does the installing.
export const UPDATE_REPO = 'ForsakenBlank/Nurtron';
export const RELEASES_PAGE = `https://github.com/${UPDATE_REPO}/releases`;
const RELEASES_API = `https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=30`;
const MOST_NOTES = 4000;

export interface Release {
  tag: string;
  version: string;
  date: string; // like 2026-11-07
  notes: string;
  page: string; // its page on GitHub, which is the only thing that ever gets opened
  builds: string[]; // the names of the files attached to it
}

// 1 if a is newer than b, -1 if older, 0 if the same. "v0.2.0" and "0.2" count as the same
export function compareVersions(a: string, b: string): number {
  const x = String(a).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const y = String(b).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length, 3); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? 1 : -1;
  }
  return 0;
}

// a page link is only kept if it really is a page of this game's releases, so nothing else can ever be opened from here
export function safePage(url: unknown): string {
  return typeof url === 'string' && url.startsWith(`${RELEASES_PAGE}/`) && !/[\s"'<>]/.test(url) ? url : RELEASES_PAGE;
}

// what GitHub sent, checked field by field. drafts, test versions and anything that isn't a plain version number are left out
export function parseReleases(raw: unknown): Release[] {
  if (!Array.isArray(raw)) throw new Error('GitHub sent something unexpected.');
  const out: Release[] = [];
  for (const one of raw.slice(0, 100)) {
    const r = (one ?? {}) as Record<string, unknown>;
    const tag = typeof r.tag_name === 'string' ? r.tag_name : '';
    if (r.draft === true || r.prerelease === true || !/^v?\d+(\.\d+){0,3}$/.test(tag)) continue;
    const date = typeof r.published_at === 'string' && /^\d{4}-\d\d-\d\d/.test(r.published_at) ? r.published_at.slice(0, 10) : '';
    const builds = (Array.isArray(r.assets) ? r.assets : [])
      .map((a) => (a as Record<string, unknown> | null)?.name)
      .filter((n): n is string => typeof n === 'string')
      .map((n) => n.slice(0, 120));
    out.push({ tag, version: tag.replace(/^v/i, ''), date, notes: typeof r.body === 'string' ? r.body.slice(0, MOST_NOTES) : '', page: safePage(r.html_url), builds });
  }
  return out.sort((a, b) => compareVersions(b.version, a.version));
}

export async function fetchReleases(): Promise<Release[]> {
  const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (res.status === 404) throw new Error('No releases found.');
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
  return parseReleases(await res.json());
}

// what the status line says after a check
export function updateWords(releases: Release[], current: string): { words: string; newer: Release | null } {
  const newest = releases[0];
  if (!newest) return { words: 'No versions are published yet.', newer: null };
  if (compareVersions(newest.version, current) > 0) return { words: `Version ${newest.version} is available. Your creatures and worlds stay as they are.`, newer: newest };
  return { words: `You're up to date (${current}). Older versions are listed if you want to go back.`, newer: null };
}

// what the desktop app offers. there's none in a browser, which only gets the download pages
export interface Installer {
  info(): Promise<{ current: string; asset: string | null; cantInstall: string | null }>;
  install(version: string): Promise<boolean>;
  onProgress(callback: (progress: { stage: string; percent: number }) => void): () => void;
}

export function installer(): Installer | null {
  const bridge = (window as unknown as { nurtronApp?: { updates?: Installer } }).nurtronApp?.updates;
  return bridge && typeof bridge.install === 'function' ? bridge : null;
}

// what pressing a version's button would do
export function verbFor(version: string, current: string): 'Update' | 'Reinstall' | 'Downgrade' {
  const c = compareVersions(version, current);
  return c > 0 ? 'Update' : c === 0 ? 'Reinstall' : 'Downgrade';
}

// versions before this one can't install anything themselves, so going back to one is a one-way trip
export const FIRST_WITH_INSTALLER = '0.2.1';
