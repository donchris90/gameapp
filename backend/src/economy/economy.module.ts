import { Module } from '@nestjs/common';
import { AppConfig, CONFIG } from '../config/config';
import { AD_KEYS, GoogleAdKeys } from './ad-signature';
import { EconomyController } from './economy.controller';
import { EconomyService } from './economy.service';
import { STORE_VERIFIER, buildStoreVerifier } from './store.verifier';

@Module({
  controllers: [EconomyController],
  providers: [
    EconomyService,
    { provide: STORE_VERIFIER, inject: [CONFIG], useFactory: (c: AppConfig) => buildStoreVerifier(c) },
    { provide: AD_KEYS, useFactory: () => new GoogleAdKeys() },
  ],
  exports: [EconomyService],
})
export class EconomyModule {}
