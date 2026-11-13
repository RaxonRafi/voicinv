import {
  buildWaitlistPayload,
  submitWaitlist,
  toAsciiDigits,
  type WaitlistFormValues,
  type WaitlistPayload,
} from '../waitlist';

const form = (overrides: Partial<WaitlistFormValues>): WaitlistFormValues => ({
  contact: '',
  name: '',
  shopType: '',
  website: '',
  ...overrides,
});

describe('toAsciiDigits', () => {
  it('converts Bengali digits and leaves everything else alone', () => {
    expect(toAsciiDigits('০১৭১২৩৪৫৬৭৮')).toBe('01712345678');
    expect(toAsciiDigits('+৮৮০ 17')).toBe('+880 17');
    expect(toAsciiDigits('karim@example.com')).toBe('karim@example.com');
  });
});

describe('buildWaitlistPayload', () => {
  it('sends an email address in lower case', () => {
    expect(buildWaitlistPayload(form({ contact: '  Karim@Example.COM ' }), 'en')).toEqual({
      ok: true,
      payload: { email: 'karim@example.com', locale: 'en' },
    });
  });

  it.each([
    ['01712345678', '01712345678'],
    ['+880 1712-345678', '+8801712345678'],
    ['(017) 1234.5678', '01712345678'],
    ['০১৭১২৩৪৫৬৭৮', '01712345678'],
  ])('sends the phone number %s as %s', (typed, phone) => {
    expect(buildWaitlistPayload(form({ contact: typed }), 'bn')).toEqual({
      ok: true,
      payload: { phone, locale: 'bn' },
    });
  });

  it('includes the optional fields only when they are filled in', () => {
    const result = buildWaitlistPayload(
      form({ contact: 'a@example.com', name: '  Karim Uddin ', shopType: 'grocery' }),
      'bn',
    );
    expect(result).toEqual({
      ok: true,
      payload: { email: 'a@example.com', name: 'Karim Uddin', shopType: 'grocery', locale: 'bn' },
    });
  });

  it('passes the honeypot value through so the API can discard the signup', () => {
    const result = buildWaitlistPayload(
      form({ contact: 'bot@example.com', website: 'http://spam.example' }),
      'en',
    );
    expect(result).toMatchObject({ ok: true, payload: { website: 'http://spam.example' } });
  });

  it('asks for a contact when none was given', () => {
    expect(buildWaitlistPayload(form({ contact: '   ' }), 'en')).toEqual({
      ok: false,
      error: 'CONTACT_REQUIRED',
    });
  });

  it.each(['karim@', '@example.com', 'a b@example.com', '12345', '12ab567890', '+', 'hello'])(
    'rejects "%s" as neither a phone number nor an email',
    (contact) => {
      expect(buildWaitlistPayload(form({ contact }), 'en')).toEqual({
        ok: false,
        error: 'CONTACT_INVALID',
      });
    },
  );

  it('keeps the name within the length the API accepts', () => {
    const result = buildWaitlistPayload(
      form({ contact: 'a@example.com', name: 'x'.repeat(300) }),
      'en',
    );
    expect(result.ok && result.payload.name).toHaveLength(120);
  });
});

describe('submitWaitlist', () => {
  const payload: WaitlistPayload = { phone: '01712345678', locale: 'bn' };
  const apiBaseUrl = 'https://api.example.com';

  const respondWith = (status: number) =>
    vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status })));

  it('posts JSON to the versioned waitlist endpoint', async () => {
    const fetchFn = respondWith(201);

    await expect(submitWaitlist(payload, { apiBaseUrl, fetchFn })).resolves.toBe('JOINED');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('https://api.example.com/api/v1/waitlist');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual(payload);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [400, 'INVALID'],
    [429, 'RATE_LIMITED'],
    [500, 'UNAVAILABLE'],
    [503, 'UNAVAILABLE'],
    [404, 'UNAVAILABLE'],
  ] as const)('maps HTTP %i to %s', async (status, expected) => {
    await expect(
      submitWaitlist(payload, { apiBaseUrl, fetchFn: respondWith(status) }),
    ).resolves.toBe(expected);
  });

  it('reports a network failure instead of throwing', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(submitWaitlist(payload, { apiBaseUrl, fetchFn })).resolves.toBe('UNAVAILABLE');
  });

  it('gives up when the API does not answer in time', async () => {
    const fetchFn = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    await expect(submitWaitlist(payload, { apiBaseUrl, fetchFn, timeoutMs: 10 })).resolves.toBe(
      'UNAVAILABLE',
    );
  });
});
