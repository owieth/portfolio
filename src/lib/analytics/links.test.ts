import { describe, expect, it } from 'vitest';

import { isOutbound, linkFields } from '@/lib/analytics/links';

describe('linkFields', () => {
  it('splits an absolute url into url, text and domain', () => {
    expect(linkFields('https://github.com/owieth', 'GitHub')).toEqual({
      link_url: 'https://github.com/owieth',
      link_text: 'GitHub',
      link_domain: 'github.com',
    });
  });

  it('trims the link text', () => {
    expect(linkFields('https://example.com/', '  Read more  ').link_text).toBe(
      'Read more',
    );
  });

  it('falls back to an empty domain for a non-url href', () => {
    expect(linkFields('mailto:hi@example.com', 'Email').link_domain).toBe('');
  });
});

describe('isOutbound', () => {
  const host = 'olivierwinkler.com';

  it('is true for an http(s) link on a different host', () => {
    expect(isOutbound('https://github.com/owieth', host)).toBe(true);
  });

  it('is false for a link on the current host', () => {
    expect(isOutbound(`https://${host}/projects`, host)).toBe(false);
  });

  it('is false for mailto, tel and non-http schemes', () => {
    expect(isOutbound('mailto:hi@example.com', host)).toBe(false);
    expect(isOutbound('tel:+123456789', host)).toBe(false);
  });

  it('is false for a malformed or relative href', () => {
    expect(isOutbound('/projects', host)).toBe(false);
    expect(isOutbound('#section', host)).toBe(false);
  });
});
