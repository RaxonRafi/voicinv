import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';

import { Device } from './entities/device.entity.js';

export interface NewDevice {
  shopId: string;
  id: string;
  deviceCode: string;
  name: string;
  platform: string;
}

/**
 * All TypeORM access for the devices module. Every query is keyed by shop, so a device ID
 * from another tenant never matches. Pass `manager` to take part in a transaction.
 */
@Injectable()
export class DevicesRepository {
  constructor(@InjectRepository(Device) private readonly devices: Repository<Device>) {}

  private repo(manager?: EntityManager): Repository<Device> {
    return manager ? manager.getRepository(Device) : this.devices;
  }

  find(shopId: string, id: string, manager?: EntityManager): Promise<Device | null> {
    return this.repo(manager).findOneBy({ shopId, id });
  }

  /** Like `find`, but holds a row lock until the transaction ends. */
  findForUpdate(shopId: string, id: string, manager: EntityManager): Promise<Device | null> {
    return manager
      .getRepository(Device)
      .findOne({ where: { shopId, id }, lock: { mode: 'pessimistic_write' } });
  }

  /**
   * Strict INSERT (never `save`, which would silently update an existing row): a second
   * registration of the same device fails on the primary key instead of changing its code.
   */
  async insert(device: NewDevice, manager?: EntityManager): Promise<Device> {
    const row = this.repo(manager).create({ ...device, lastSyncAt: null });
    await this.repo(manager).insert(row);
    return row;
  }

  async rename(
    shopId: string,
    id: string,
    change: { name: string; platform: string },
    manager?: EntityManager,
  ): Promise<void> {
    await this.repo(manager).update({ shopId, id }, change);
  }

  async touchLastSync(
    shopId: string,
    id: string,
    at: Date,
    manager?: EntityManager,
  ): Promise<void> {
    await this.repo(manager).update({ shopId, id }, { lastSyncAt: at });
  }
}
