import { HttpStatus, Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

import { AppException, ErrorCode } from '../../common/index.js';
import { uniqueViolationConstraint } from '../../database/errors.js';
import { type Shop } from './entities/shop.entity.js';
import { type NewShop, type ShopProfile, ShopsRepository } from './shops.repository.js';

@Injectable()
export class ShopsService {
  constructor(private readonly repository: ShopsRepository) {}

  /**
   * Creates the shop for a new account, keeping the ID it already has on the device.
   * Fails with `CONFLICT` when that ID is already registered to an account.
   */
  async create(shop: NewShop, manager?: EntityManager): Promise<Shop> {
    const taken = new AppException(
      HttpStatus.CONFLICT,
      ErrorCode.CONFLICT,
      'This shop already belongs to an account. Sign in instead.',
    );
    if (await this.repository.existsById(shop.id, manager)) throw taken;
    try {
      return await this.repository.insert(shop, manager);
    } catch (error) {
      // Two sign-ups for the same shop at the same moment: the second insert loses.
      if (uniqueViolationConstraint(error) !== null) throw taken;
      throw error;
    }
  }

  findByOwner(ownerId: string, manager?: EntityManager): Promise<Shop | null> {
    return this.repository.findByOwner(ownerId, manager);
  }

  /** The shop, or a 404 when it no longer exists (for example after account deletion). */
  async getById(id: string, manager?: EntityManager): Promise<Shop> {
    const shop = await this.repository.findById(id, manager);
    if (!shop) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Shop not found.');
    }
    return shop;
  }

  /** Applies a profile change that arrived through sync. */
  updateProfile(id: string, profile: ShopProfile, manager?: EntityManager): Promise<void> {
    return this.repository.updateProfile(id, profile, manager);
  }

  /** Reserves the shop's next device number (1, 2, 3, …) for a newly registered device. */
  async takeDeviceSequence(shopId: string, manager?: EntityManager): Promise<number> {
    const sequence = await this.repository.takeDeviceSequence(shopId, manager);
    if (sequence === null) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Shop not found.');
    }
    return sequence;
  }
}
