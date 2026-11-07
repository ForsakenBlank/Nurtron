// the update checker only reads what GitHub says about releases, and has to cope with anything it sends
import { describe, expect, it } from 'vitest';
import { compareVersions, parseReleases, RELEASES_PAGE, safePage, updateWords } from '../src/app/updates.ts';

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  published_at: '2026-11-07T10:00:00Z',
  body: 'What changed',
  html_url: `${RELEASES_PAGE}/tag/${tag}`,
  assets: [{ name: 'Nurtron-linux-x64.tar.gz' }],
  ...extra,
});

describe('update checker', () => {
  it('compares versions the way people read them', () => {
    expect(compareVersions('0.10.0', '0.9.3')).toBe(1);
    expect(compareVersions('v0.2.0', '0.2')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });

  it('lists releases newest first, leaving out drafts, test versions and odd tags', () => {
    const list = parseReleases([release('v0.1.0'), release('v0.2.0'), release('v0.3.0', { draft: true }), release('v0.4.0-beta'), release('nightly'), release('v0.2.1', { prerelease: true }), null, 7]);
    expect(list.map((r) => r.version)).toEqual(['0.2.0', '0.1.0']);
    expect(list[0]).toMatchObject({ date: '2026-11-07', notes: 'What changed', builds: ['Nurtron-linux-x64.tar.gz'] });
  });

  it('never keeps a link to anywhere but this game’s release pages', () => {
    expect(safePage('https://evil.example/download.exe')).toBe(RELEASES_PAGE);
    expect(safePage('https://github.com/ForsakenBlank/Nurtron-fake/releases/x')).toBe(RELEASES_PAGE);
    expect(safePage('javascript:alert(1)')).toBe(RELEASES_PAGE);
    expect(safePage(`${RELEASES_PAGE}/tag/v0.2.0`)).toBe(`${RELEASES_PAGE}/tag/v0.2.0`);
    expect(parseReleases([release('v0.2.0', { html_url: 'https://evil.example/' })])[0].page).toBe(RELEASES_PAGE);
  });

  it('copes with nonsense from GitHub', () => {
    expect(() => parseReleases({ message: 'rate limited' })).toThrow();
    expect(parseReleases([{ tag_name: 'v1.0.0', body: 5, assets: 'no', published_at: 'soon' }])[0]).toMatchObject({ notes: '', builds: [], date: '' });
    expect(parseReleases([release('v1.0.0', { body: 'x'.repeat(10000) })])[0].notes.length).toBe(4000);
  });

  it('says whether there is something newer', () => {
    const list = parseReleases([release('v0.2.0'), release('v0.1.0')]);
    expect(updateWords(list, '0.1.0').newer?.version).toBe('0.2.0');
    expect(updateWords(list, '0.2.0').newer).toBeNull();
    expect(updateWords([], '0.2.0').words).toBe('No versions are published yet.');
  });
});
