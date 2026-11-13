import { isUuidV7 } from '../../../shared/index.js';
import { type User } from '../entities/user.entity.js';
import { type UsersRepository } from '../users.repository.js';
import { UsersService } from '../users.service.js';

const input = {
  identifier: { kind: 'email', value: 'karim@example.com' } as const,
  passwordHash: 'hash',
  recoveryCodeHash: 'code-hash',
};

function setup() {
  const repository = {
    insert: vi.fn((user: { id: string }) => Promise.resolve({ id: user.id } as User)),
    findById: vi.fn(),
    findByIdentifier: vi.fn(),
    updateCredentials: vi.fn().mockResolvedValue(undefined),
  };
  return { service: new UsersService(repository as unknown as UsersRepository), repository };
}

describe('UsersService', () => {
  it('creates users with server-generated UUIDv7 ids', async () => {
    const { service, repository } = setup();

    const first = await service.create(input);
    const second = await service.create(input);

    expect(isUuidV7(first.id)).toBe(true);
    expect(second.id > first.id).toBe(true);
    expect(repository.insert).toHaveBeenCalledWith({ id: first.id, ...input }, undefined);
  });

  it('reports a duplicate phone or email as IDENTIFIER_TAKEN', async () => {
    const { service, repository } = setup();
    repository.insert.mockRejectedValue({
      driverError: { code: '23505', constraint: 'uq_users_email' },
    });

    await expect(service.create(input)).rejects.toMatchObject({
      code: 'IDENTIFIER_TAKEN',
      message: 'An account with this phone number or email already exists.',
    });
  });

  it('propagates other database errors unchanged', async () => {
    const { service, repository } = setup();
    repository.insert.mockRejectedValue(new Error('connection lost'));

    await expect(service.create(input)).rejects.toThrow('connection lost');
  });
});
