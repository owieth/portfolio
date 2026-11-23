import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DesignPage from './page';

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/analytics/server/track-server', () => ({
  trackServer: vi.fn(),
}));

const readme = [
  'Intro <script>window.__pwned=1</script> text',
  '',
  '<iframe srcdoc="<script>parent.__pwned=2</script>"></iframe>',
  '',
  '# Heading',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
].join('\n');

type AsyncComponent = (props: unknown) => Promise<ReactElement>;

const renderDesignPage = async () => {
  const tree = await DesignPage();
  const mdx = tree.props.children as ReactElement<unknown, AsyncComponent>;
  return renderToStaticMarkup(await mdx.type(mdx.props));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DesignPage', () => {
  it('drops raw HTML from the remote README and keeps the markdown', async () => {
    vi.stubGlobal('fetch', async () => new Response(readme));

    const html = await renderDesignPage();

    expect(html).not.toContain('<script');
    expect(html).not.toContain('srcdoc');
    expect(html).toContain('<h1>Heading</h1>');
    expect(html).toContain('<table>');
  });
});
