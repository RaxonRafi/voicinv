import { type Shop } from '../entities/shop.entity.js';
import { type ShopsRepository } from '../shops.repository.js';
import { ShopsService } from '../shops.service.js';

const newShop = {
  id: 'shop-1',
  ownerId: 'user-1',
  name: 'Rahim Store',
  currencyCode: 'BDT',
  defaultLanguage: 'bn',
  invoicePrefix: 'RS',
};

function setup() {
  const repository = {
    insert: vi.fn((shop: Partial<Shop>) => Promise.resolve(shop as Shop)),
    existsById: vi.fn().mockResolvedValue(false),
    findById: vi.fn().mockResolvedValue(null),
    findByOwner: vi.fn().mockResolvedValue(null),
    updateProfile: vi.fn().mockResolvedValue(undefined),
    takeDeviceSequence: vi.fn().mockResolvedValue(1),
  };
  return { service: new ShopsService(repository as unknown as ShopsRepository), repository };
}

describe('ShopsService', () => {
  it('creates a shop with the ID it has on the device', async () => {
    const { service, repository } = setup();
    const manager = { manager: true } as never;

    await expect(service.create(newShop, manager)).resolves.toMatchObject({ id: 'shop-1' });
    expect(repository.insert).toHaveBeenCalledWith(newShop, manager);
  });

  it('refuses a shop ID that already belongs to an account', async () => {
    const { service, repository } = setup();
    repository.existsById.mockResolvedValue(true);

    await expect(service.create(newShop)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('answers a missing shop with NOT_FOUND', async () => {
    const { service } = setup();
    await expect(service.getById('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('hands out device sequences and fails for an unknown shop', async () => {
    const { service, repository } = setup();
    await expect(service.takeDeviceSequence('shop-1')).resolves.toBe(1);

    repository.takeDeviceSequence.mockResolvedValue(null);
    await expect(service.takeDeviceSequence('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
