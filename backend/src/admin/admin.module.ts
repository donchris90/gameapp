import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminSeedService } from './admin-seed.service';
import { AdminService } from './admin.service';

@Module({ controllers: [AdminController], providers: [AdminService, AdminGuard, AdminSeedService] })
export class AdminModule {}
