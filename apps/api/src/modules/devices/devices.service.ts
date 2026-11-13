import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { AppException, type AuthContext, ErrorCode } from '../../common/index.js';
import { uniqueViolationConstraint } from '../../database/errors.js';
import { ShopsService } from '../shops/index.js';
import { deviceCodeFromSequence } from './device-code.js';
import { DevicesRepository } from './devices.repository.js';
import { type Device } from './entities/device.entity.js';

export interface RegisterDeviceInput {
  id: string;
  name: string;
  platform: string;
}

@Injectable()
export class DevicesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly repository: DevicesRepository,
    private readonly shops: ShopsService,
  ) {}

  /**
   * Registers a device with the caller's shop and gives it a device code.
   *
   * Idempotent: registering the same device again keeps its code (only the name and platform
   * are refreshed), so a retry after a lost response never burns a second code. The first
   * device of a shop receives "A", the code it already used before the account existed.
   */
  async register(auth: AuthContext, input: RegisterDeviceInput): Promise<Device> {
    try {
      return await this.dataSource.transaction((manager) => this.registerIn(manager, auth, input));
    } catch (error) {
      // Two simultaneous first registrations of one device: the loser finds the winner's row.
      if (uniqueViolationConstraint(error) === null) throw error;
      const existing = await this.repository.find(auth.shopId, input.id);
      if (!existing) throw error;
      return existing;
    }
  }

  private async registerIn(
    manager: EntityManager,
    auth: AuthContext,
    input: RegisterDeviceInput,
  ): Promise<Device> {
    const existing = await this.repository.findForUpdate(auth.shopId, input.id, manager);
    if (existing) {
      const change = { name: input.name, platform: input.platform };
      await this.repository.rename(auth.shopId, input.id, change, manager);
      return { ...existing, ...change };
    }

    const sequence = await this.shops.takeDeviceSequence(auth.shopId, manager);
    const deviceCode = deviceCodeFromSequence(sequence);
    if (!deviceCode) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'This shop has reached the maximum number of devices.',
      );
    }
    return this.repository.insert({ shopId: auth.shopId, deviceCode, ...input }, manager);
  }

  /**
   * The device, if it is registered to this shop. Used by other modules (sync, backups) to
   * check a client-sent device ID against the authenticated shop before trusting it.
   */
  async getForShop(shopId: string, deviceId: string, manager?: EntityManager): Promise<Device> {
    const device = await this.repository.find(shopId, deviceId, manager);
    if (!device) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.FORBIDDEN,
        'This device is not registered to your shop.',
      );
    }
    return device;
  }

  markSynced(shopId: string, deviceId: string, at: Date, manager?: EntityManager): Promise<void> {
    return this.repository.touchLastSync(shopId, deviceId, at, manager);
  }
}
