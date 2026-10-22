import { Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserStatus } from '../generated/prisma/client';
import { SettingsService } from '../settings/settings.service';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

class StatusDto {
  // Deleting is the player's own choice and cannot be set or undone from here.
  @IsIn(['ACTIVE', 'SUSPENDED', 'BANNED']) status!: UserStatus;
  @IsString() @MinLength(3) @MaxLength(200) reason!: string;
}
class ResolveDto {
  @IsString() @MaxLength(200) note!: string;
}
class AdjustDto {
  @IsInt() @Min(-10_000_000) @Max(10_000_000) amount!: number;
  @IsString() @MinLength(3) @MaxLength(200) reason!: string;
}
class AdPolicyDto {
  @IsOptional() @IsInt() @Min(0) @Max(20) TICTACTOE?: number;
  @IsOptional() @IsInt() @Min(0) @Max(20) WATER_SORT?: number;
  @IsOptional() @IsInt() @Min(0) @Max(20) AYO?: number;
  @IsOptional() @IsInt() @Min(0) @Max(20) LUDO?: number;
  @IsOptional() @IsInt() @Min(0) @Max(20) WHOT?: number;
  @IsOptional() @IsInt() @Min(0) @Max(20) APEX_RUN?: number;
}
class CallPricingDto {
  @IsOptional() @IsInt() @Min(0) @Max(1000) voice?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000) video?: number;
}
const lim = (n: number) => Math.min(Math.max(n, 1), 100);

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly settings: SettingsService) {}

  @Get('settings/ads')
  adPolicy() { return this.settings.adPolicy(); }

  @Post('settings/ads') @HttpCode(200)
  setAdPolicy(@CurrentUser() a: AuthUser, @Body() dto: AdPolicyDto) { return this.settings.setAdPolicy(a.id, { ...dto }); }

  @Get('settings/calls')
  callPricing() { return this.settings.callPricing(); }

  @Post('settings/calls') @HttpCode(200)
  setCallPricing(@CurrentUser() a: AuthUser, @Body() dto: CallPricingDto) { return this.settings.setCallPricing(a.id, { ...dto }); }

  @Get('stats') stats() { return this.admin.stats(); }

  @Get('users')
  users(@Query('q') q?: string, @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit = 25, @Query('cursor') cursor?: string) {
    return this.admin.users({ q, limit: lim(limit), cursor });
  }

  @Get('users/:id') user(@Param('id', ParseUUIDPipe) id: string) { return this.admin.user(id); }

  @Post('users/:id/status') @HttpCode(200)
  status(@CurrentUser() a: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto) { return this.admin.setStatus(a.id, id, dto.status, dto.reason); }

  @Post('users/:id/adjust') @HttpCode(200)
  adjust(@CurrentUser() a: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustDto) { return this.admin.adjust(a.id, id, dto.amount, dto.reason); }

  @Get('matches')
  matches(@Query('status') status?: string, @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit = 25, @Query('cursor') cursor?: string) {
    return this.admin.matches({ status: status === 'ACTIVE' || status === 'FINISHED' ? status : undefined, limit: lim(limit), cursor });
  }

  @Get('purchases')
  purchases(@Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit = 25, @Query('cursor') cursor?: string) { return this.admin.purchases({ limit: lim(limit), cursor }); }

  @Get('audit')
  audit(@Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit = 25, @Query('cursor') cursor?: string) { return this.admin.audit({ limit: lim(limit), cursor }); }

  @Get('reports')
  reports(@Query('status', new DefaultValuePipe('OPEN')) status: string, @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number) {
    return this.admin.reports({ status: status === 'RESOLVED' ? 'RESOLVED' : 'OPEN', limit: Math.min(Math.max(limit, 1), 200) });
  }

  @Post('reports/:id/resolve') @HttpCode(200)
  resolveReport(@CurrentUser() a: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveDto) {
    return this.admin.resolveReport(a.id, id, dto.note);
  }
}
