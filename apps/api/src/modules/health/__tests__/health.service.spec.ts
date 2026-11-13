import { type DataSource } from 'typeorm';

import { HealthService } from '../health.service.js';

function setup(query: () => Promise<unknown>) {
  const dataSource = { query: vi.fn(query) } as unknown as DataSource;
  return new HealthService(dataSource);
}

describe('HealthService', () => {
  it('reports ok when the database answers', async () => {
    const service = setup(() => Promise.resolve([{ '?column?': 1 }]));
    await expect(service.check()).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('reports degraded instead of throwing when the database is unreachable', async () => {
    const service = setup(() => Promise.reject(new Error('connect ECONNREFUSED')));
    await expect(service.check()).resolves.toEqual({ status: 'degraded', database: 'down' });
  });
});
