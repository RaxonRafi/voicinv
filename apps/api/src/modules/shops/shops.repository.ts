import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';

import { Shop } from './entities/shop.entity.js';

export interface NewShop {
  id: string;
  ownerId: string;
  name: string;
  currencyCode: string;
  defaultLanguage: string;
  invoicePrefix: string;
}

/** The profile fields a shop owner can change from the app. */
export interface ShopProfile {
  name: string;
  address: string | null;
  phone: string | null;
  logo: string | null;
  currencyCode: string;
  defaultLanguage: string;
  invoicePrefix: string;
}

/** All TypeORM access for the shops module. Pass `manager` to take part in a transaction. */
@Injectable()
export class ShopsRepository {
  constructor(@InjectRepository(Shop) private readonly shops: Repository<Shop>) {}

  private repo(manager?: EntityManager): Repository<Shop> {
    return manager ? manager.getRepository(Shop) : this.shops;
  }

  /**
   * Strict INSERT (never `save`, which would silently update an existing row): a shop ID
   * that is already registered fails on the primary key instead of changing its owner.
   */
  async insert(shop: NewShop, manager?: EntityManager): Promise<Shop> {
    const row = this.repo(manager).create({ ...shop, address: null, phone: null, logo: null });
    await this.repo(manager).insert(row);
    return row;
  }

  existsById(id: string, manager?: EntityManager): Promise<boolean> {
    return this.repo(manager).existsBy({ id });
  }

  findById(id: string, manager?: EntityManager): Promise<Shop | null> {
    return this.repo(manager).findOneBy({ id });
  }

  /** The owner's shop. An account owns one shop in v1; the oldest wins if that ever changes. */
  findByOwner(ownerId: string, manager?: EntityManager): Promise<Shop | null> {
    return this.repo(manager).findOne({ where: { ownerId }, order: { createdAt: 'ASC' } });
  }

  async updateProfile(id: string, profile: ShopProfile, manager?: EntityManager): Promise<void> {
    await this.repo(manager).update({ id }, profile);
  }

  /**
   * Hands out the shop's next device number. One atomic statement, so two devices
   * registering at the same moment can never receive the same number.
   */
  async takeDeviceSequence(id: string, manager?: EntityManager): Promise<number | null> {
    const result = await this.repo(manager)
      .createQueryBuilder()
      .update()
      .set({ deviceSequence: () => '"device_sequence" + 1' })
      .where('id = :id', { id })
      .returning('"device_sequence"')
      .execute();
    const rows = result.raw as { device_sequence: number }[];
    const next = rows[0]?.device_sequence;
    return next === undefined ? null : next - 1;
  }
}
