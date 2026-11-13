import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ShopsModule } from '../shops/index.js';
import { UsersModule } from '../users/index.js';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { MeController } from './me.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([RefreshToken]), UsersModule, ShopsModule],
  controllers: [AuthController, MeController],
  providers: [AuthService, AuthRepository],
})
export class AuthModule {}
