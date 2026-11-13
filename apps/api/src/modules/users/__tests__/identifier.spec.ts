import { parseIdentifier } from '../identifier.js';
import { identifierOf } from '../users.service.js';

describe('parseIdentifier', () => {
  it('recognizes and lowercases email addresses', () => {
    expect(parseIdentifier('  Karim@Example.COM ')).toEqual({
      kind: 'email',
      value: 'karim@example.com',
    });
  });

  it('recognizes phone numbers and strips their formatting', () => {
    expect(parseIdentifier('+880 1712-345678')).toEqual({ kind: 'phone', value: '+8801712345678' });
    expect(parseIdentifier('(017) 1234.5678')).toEqual({ kind: 'phone', value: '01712345678' });
  });

  it.each(['', '   ', 'karim', '12345', '+12ab567890', 'a@b', 'two@@example.com', 'a b@c.com'])(
    'rejects %j',
    (input) => {
      expect(parseIdentifier(input)).toBeNull();
    },
  );

  it('rejects overlong emails', () => {
    expect(parseIdentifier(`${'a'.repeat(250)}@example.com`)).toBeNull();
  });
});

describe('identifierOf', () => {
  it('returns whichever identifier the account has', () => {
    expect(identifierOf({ email: 'a@example.com', phone: null })).toBe('a@example.com');
    expect(identifierOf({ email: null, phone: '+8801712345678' })).toBe('+8801712345678');
  });
});
