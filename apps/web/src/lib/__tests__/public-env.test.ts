import { resolvePublicEnv } from '../public-env';

describe('resolvePublicEnv', () => {
  it('falls back to local URLs during development', () => {
    expect(resolvePublicEnv({}, 'development')).toEqual({
      apiUrl: 'http://localhost:4000',
      siteUrl: 'http://localhost:3000',
      contactEmail: undefined,
    });
  });

  it('refuses a production build without an API URL', () => {
    expect(() => resolvePublicEnv({}, 'production')).toThrow(/NEXT_PUBLIC_API_URL/);
    expect(() => resolvePublicEnv({ NEXT_PUBLIC_API_URL: '  ' }, 'production')).toThrow(
      /NEXT_PUBLIC_API_URL/,
    );
  });

  it('normalises origins and strips trailing slashes', () => {
    expect(
      resolvePublicEnv(
        {
          NEXT_PUBLIC_API_URL: 'https://api.example.com/',
          NEXT_PUBLIC_SITE_URL: ' https://example.com ',
          NEXT_PUBLIC_CONTACT_EMAIL: 'hello@example.com',
        },
        'production',
      ),
    ).toEqual({
      apiUrl: 'https://api.example.com',
      siteUrl: 'https://example.com',
      contactEmail: 'hello@example.com',
    });
  });

  it.each(['api.example.com', 'https://api.example.com/api/v1', 'ftp://example.com'])(
    'rejects "%s" as an API origin',
    (value) => {
      expect(() => resolvePublicEnv({ NEXT_PUBLIC_API_URL: value }, 'production')).toThrow(
        /must be an origin/,
      );
    },
  );

  it('rejects a malformed contact email and treats an empty one as unset', () => {
    expect(() => resolvePublicEnv({ NEXT_PUBLIC_CONTACT_EMAIL: 'not-an-email' }, 'test')).toThrow(
      /NEXT_PUBLIC_CONTACT_EMAIL/,
    );
    expect(
      resolvePublicEnv({ NEXT_PUBLIC_CONTACT_EMAIL: '' }, 'test').contactEmail,
    ).toBeUndefined();
  });
});
