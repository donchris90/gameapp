import { Global, Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { ApexCoinsService } from './apex-coins.service';
import { WalletService } from './wallet.service';

@Global()
@Module({ controllers: [WalletController], providers: [WalletService, ApexCoinsService], exports: [WalletService] })
export class WalletModule {}
