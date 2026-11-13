import { Injectable, Logger } from '@nestjs/common';

import { type CreateWaitlistEntryDto } from './dto/create-waitlist-entry.dto.js';
import { WaitlistRepository } from './waitlist.repository.js';

export interface WaitlistJoinResult {
  joined: true;
}

const JOINED: WaitlistJoinResult = { joined: true };

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(private readonly repository: WaitlistRepository) {}

  /**
   * Adds a landing-page visitor to the waitlist.
   *
   * The result is identical for new signups, repeat signups and bot submissions, so the
   * endpoint reveals nothing about who is already on the list.
   */
  async join(dto: CreateWaitlistEntryDto): Promise<WaitlistJoinResult> {
    // Honeypot: the field is hidden from people, so a value means an automated submission.
    if (dto.website) {
      this.logger.warn('Discarded waitlist signup with a filled honeypot field.');
      return JOINED;
    }

    const created = await this.repository.insertIfNew({
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      name: dto.name ?? null,
      locale: dto.locale,
      shopType: dto.shopType ?? null,
      source: 'landing',
    });
    // Contact details are personal data: log the outcome only.
    this.logger.log(created ? 'Waitlist signup stored.' : 'Waitlist signup already existed.');
    return JOINED;
  }
}
