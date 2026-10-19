import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig, CONFIG } from '../config/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [CONFIG],
      useFactory: (c: AppConfig) => ({ secret: c.jwtAccessSecret, signOptions: { expiresIn: c.accessTokenTtlSeconds } }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
