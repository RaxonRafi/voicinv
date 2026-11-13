import { type CreateWaitlistEntryDto } from '../dto/create-waitlist-entry.dto.js';
import { type WaitlistRepository } from '../waitlist.repository.js';
import { WaitlistService } from '../waitlist.service.js';

function setup(insertResult = true) {
  const insertIfNew = vi.fn().mockResolvedValue(insertResult);
  const repository = { insertIfNew } as unknown as WaitlistRepository;
  return { service: new WaitlistService(repository), insertIfNew };
}

const dto = (overrides: Partial<CreateWaitlistEntryDto> = {}): CreateWaitlistEntryDto => ({
  locale: 'en',
  email: 'karim@example.com',
  ...overrides,
});

describe('WaitlistService', () => {
  it('stores a new signup with unset fields as null', async () => {
    const { service, insertIfNew } = setup();

    await expect(service.join(dto())).resolves.toEqual({ joined: true });
    expect(insertIfNew).toHaveBeenCalledWith({
      email: 'karim@example.com',
      phone: null,
      name: null,
      locale: 'en',
      shopType: null,
      source: 'landing',
    });
  });

  it('stores every provided field', async () => {
    const { service, insertIfNew } = setup();

    await service.join(
      dto({ phone: '+8801712345678', name: 'Karim', locale: 'bn', shopType: 'grocery' }),
    );
    expect(insertIfNew).toHaveBeenCalledWith({
      email: 'karim@example.com',
      phone: '+8801712345678',
      name: 'Karim',
      locale: 'bn',
      shopType: 'grocery',
      source: 'landing',
    });
  });

  it('answers a repeat signup exactly like a new one', async () => {
    const { service } = setup(false);
    await expect(service.join(dto())).resolves.toEqual({ joined: true });
  });

  it('discards submissions that fill the honeypot without touching the database', async () => {
    const { service, insertIfNew } = setup();

    await expect(service.join(dto({ website: 'http://spam.example' }))).resolves.toEqual({
      joined: true,
    });
    expect(insertIfNew).not.toHaveBeenCalled();
  });

  it('propagates database failures', async () => {
    const { service, insertIfNew } = setup();
    insertIfNew.mockRejectedValue(new Error('connection lost'));

    await expect(service.join(dto())).rejects.toThrow('connection lost');
  });
});
