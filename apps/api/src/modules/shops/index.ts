// Public API of the shops module. Other modules import only from this file.
export { type Shop } from './entities/shop.entity.js';
export { ShopsModule } from './shops.module.js';
export { type NewShop, type ShopProfile } from './shops.repository.js';
export { ShopsService } from './shops.service.js';
