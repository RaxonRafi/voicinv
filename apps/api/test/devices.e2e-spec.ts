import { randomUUID } from 'node:crypto';

import { createAccount, post } from './support/accounts.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('POST /api/v1/devices (e2e)', () => {
  let testApp: TestApp;

  const device = (overrides: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    name: 'Counter phone',
    platform: 'android',
    ...overrides,
  });

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('requires a signed-in user', async () => {
    const response = await post(testApp, '/devices', device());

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('gives the first device code A and the next ones B, C', async () => {
    const account = await createAccount(testApp);
    const first = device();

    const responses = [
      await post(testApp, '/devices', first, account.accessToken),
      await post(testApp, '/devices', device({ name: 'Second' }), account.accessToken),
      await post(testApp, '/devices', device({ platform: 'ios' }), account.accessToken),
    ];

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(responses.map((response) => response.body.data.deviceCode)).toEqual(['A', 'B', 'C']);
    expect(responses[0]?.body).toEqual({
      data: {
        id: first.id,
        shopId: account.shopId,
        deviceCode: 'A',
        name: 'Counter phone',
        lastSyncAt: null,
      },
    });
  });

  it('keeps a device’s code when it registers again and refreshes its name', async () => {
    const account = await createAccount(testApp);
    const first = device();
    await post(testApp, '/devices', first, account.accessToken);
    await post(testApp, '/devices', device(), account.accessToken);

    const again = await post(
      testApp,
      '/devices',
      { ...first, name: '  Renamed phone ' },
      account.accessToken,
    );
    const third = await post(testApp, '/devices', device(), account.accessToken);

    expect(again.body.data).toMatchObject({ deviceCode: 'A', name: 'Renamed phone' });
    expect(third.body.data.deviceCode).toBe('C');
  });

  it('gives devices that register at the same moment different codes', async () => {
    const account = await createAccount(testApp);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => post(testApp, '/devices', device(), account.accessToken)),
    );

    const codes = responses.map((response) => response.body.data.deviceCode as string).sort();
    expect(codes).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('registers one device once when its request is sent twice at the same moment', async () => {
    const account = await createAccount(testApp);
    const same = device();
    const responses = await Promise.all([
      post(testApp, '/devices', same, account.accessToken),
      post(testApp, '/devices', same, account.accessToken),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses[0]?.body.data.deviceCode).toBe(responses[1]?.body.data.deviceCode);

    const next = await post(testApp, '/devices', device(), account.accessToken);
    expect(next.body.data.deviceCode).toBe('B');
  });

  it('keeps shops apart: the same device ID in another shop is a separate registration', async () => {
    const first = await createAccount(testApp);
    const second = await createAccount(testApp);
    const shared = device({ name: 'First shop phone' });

    await post(testApp, '/devices', shared, first.accessToken);
    await post(testApp, '/devices', device(), first.accessToken);
    const inSecondShop = await post(
      testApp,
      '/devices',
      { ...shared, name: 'Second shop phone' },
      second.accessToken,
    );

    // The second shop starts its own sequence and cannot rename or take over the first's row.
    expect(inSecondShop.body.data).toMatchObject({
      shopId: second.shopId,
      deviceCode: 'A',
      name: 'Second shop phone',
    });
    const rows: { shop_id: string; name: string; device_code: string }[] =
      await testApp.dataSource.query(
        'SELECT shop_id, name, device_code FROM devices WHERE id = $1 ORDER BY name',
        [shared.id],
      );
    expect(rows).toEqual([
      { shop_id: first.shopId, name: 'First shop phone', device_code: 'A' },
      { shop_id: second.shopId, name: 'Second shop phone', device_code: 'A' },
    ]);
  });

  it.each([
    ['an ID that is not a UUID', { id: 'phone-1' }, 'id'],
    ['an empty name', { name: '   ' }, 'name'],
    ['an overlong name', { name: 'x'.repeat(81) }, 'name'],
    ['an unknown platform', { platform: 'windows' }, 'platform'],
    ['a client-chosen shop', { shopId: randomUUID() }, 'shopId'],
    ['a client-chosen device code', { deviceCode: 'Z' }, 'deviceCode'],
  ])('rejects %s', async (_case, overrides, field) => {
    const account = await createAccount(testApp);
    const response = await post(testApp, '/devices', device(overrides), account.accessToken);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })]),
    );
  });
});
