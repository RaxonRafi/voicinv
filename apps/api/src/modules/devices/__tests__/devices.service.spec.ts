import { type DataSource } from 'typeorm';

import { type ShopsService } from '../../shops/index.js';
import { type DevicesRepository } from '../devices.repository.js';
import { DevicesService } from '../devices.service.js';
import { type Device } from '../entities/device.entity.js';

const auth = { userId: 'user-1', shopId: 'shop-1' };
const MANAGER = { manager: true };
const input = { id: 'device-1', name: 'Counter phone', platform: 'android' };

const deviceRow = (overrides: Partial<Device> = {}): Device => ({
  shopId: 'shop-1',
  id: 'device-1',
  deviceCode: 'A',
  name: 'Counter phone',
  platform: 'android',
  lastSyncAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

function setup() {
  const repository = {
    find: vi.fn().mockResolvedValue(null),
    findForUpdate: vi.fn().mockResolvedValue(null),
    insert: vi.fn((device: Partial<Device>) => Promise.resolve(deviceRow(device))),
    rename: vi.fn().mockResolvedValue(undefined),
    touchLastSync: vi.fn().mockResolvedValue(undefined),
  };
  const shops = { takeDeviceSequence: vi.fn().mockResolvedValue(1) };
  const transaction = vi.fn((run: (manager: unknown) => unknown) => run(MANAGER));
  const service = new DevicesService(
    { transaction } as unknown as DataSource,
    repository as unknown as DevicesRepository,
    shops as unknown as ShopsService,
  );
  return { service, repository, shops };
}

describe('DevicesService', () => {
  it('gives the first device of a shop the code A', async () => {
    const { service, repository, shops } = setup();

    const device = await service.register(auth, input);

    expect(shops.takeDeviceSequence).toHaveBeenCalledWith('shop-1', MANAGER);
    expect(repository.insert).toHaveBeenCalledWith(
      { shopId: 'shop-1', deviceCode: 'A', ...input },
      MANAGER,
    );
    expect(device.deviceCode).toBe('A');
  });

  it('gives later devices the following codes', async () => {
    const { service, shops } = setup();
    shops.takeDeviceSequence.mockResolvedValue(28);

    await expect(service.register(auth, input)).resolves.toMatchObject({ deviceCode: 'AB' });
  });

  it('keeps the code when the same device registers again, refreshing its name', async () => {
    const { service, repository, shops } = setup();
    repository.findForUpdate.mockResolvedValue(deviceRow({ deviceCode: 'C', name: 'Old name' }));

    const device = await service.register(auth, { ...input, name: 'New name' });

    expect(device).toMatchObject({ deviceCode: 'C', name: 'New name' });
    expect(repository.rename).toHaveBeenCalledWith(
      'shop-1',
      'device-1',
      { name: 'New name', platform: 'android' },
      MANAGER,
    );
    expect(shops.takeDeviceSequence).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('always scopes lookups to the caller’s shop', async () => {
    const { service, repository } = setup();
    await service.register({ userId: 'user-2', shopId: 'shop-2' }, input);

    expect(repository.findForUpdate).toHaveBeenCalledWith('shop-2', 'device-1', MANAGER);
  });

  it('returns the winner’s row when two registrations of one device race', async () => {
    const { service, repository } = setup();
    repository.insert.mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }));
    repository.find.mockResolvedValue(deviceRow({ deviceCode: 'B' }));

    await expect(service.register(auth, input)).resolves.toMatchObject({ deviceCode: 'B' });
  });

  it('refuses once the shop has used every device code', async () => {
    const { service, shops } = setup();
    shops.takeDeviceSequence.mockResolvedValue(18_279);

    await expect(service.register(auth, input)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('propagates unexpected database errors', async () => {
    const { service, repository } = setup();
    repository.insert.mockRejectedValue(new Error('connection lost'));

    await expect(service.register(auth, input)).rejects.toThrow('connection lost');
  });

  describe('getForShop', () => {
    it('returns a device registered to the shop', async () => {
      const { service, repository } = setup();
      repository.find.mockResolvedValue(deviceRow());

      await expect(service.getForShop('shop-1', 'device-1')).resolves.toMatchObject({
        id: 'device-1',
      });
    });

    it('refuses a device that is not registered to the shop', async () => {
      const { service } = setup();
      await expect(service.getForShop('shop-1', 'device-9')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });
});
