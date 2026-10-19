import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto } from './dto';

const AUTH_LIMIT = { default: { limit: Number(process.env.AUTH_RATE_PER_MINUTE ?? 10), ttl: 60_000 } };

@Controller('auth')
@Throttle(AUTH_LIMIT)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Headers('user-agent') ua?: string) {
    return this.auth.register(dto, ua);
  }

  @Post('login') @HttpCode(200)
  login(@Body() dto: LoginDto, @Headers('user-agent') ua?: string) {
    return this.auth.login(dto, ua);
  }

  @Post('refresh') @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Headers('user-agent') ua?: string) {
    return this.auth.refresh(dto.refreshToken, ua);
  }

  @Post('logout') @HttpCode(200)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }
}
