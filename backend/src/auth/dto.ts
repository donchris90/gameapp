import { Equals, IsBoolean, IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() @MaxLength(254)
  email!: string;

  @Matches(/^[A-Za-z0-9_]{3,20}$/, { message: 'username must be 3-20 letters, numbers or underscores' })
  username!: string;

  @IsString() @MinLength(8) @MaxLength(128)
  password!: string;

  /** YYYY-MM-DD */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'birthDate must be YYYY-MM-DD' })
  birthDate!: string;

  @IsBoolean() @Equals(true, { message: 'You must confirm you are old enough to play' })
  confirmAdult!: boolean;

  @IsBoolean() @Equals(true, { message: 'You must accept the terms' })
  acceptTerms!: boolean;
}

export class LoginDto {
  /** Email or username */
  @IsString() @MinLength(3) @MaxLength(254)
  identifier!: string;

  @IsString() @MinLength(1) @MaxLength(128)
  password!: string;
}

export class RefreshDto {
  @IsString() @MinLength(20) @MaxLength(200)
  refreshToken!: string;
}

export class ForgotDto {
  @IsEmail() @MaxLength(254)
  email!: string;
}

export class ResetDto {
  @IsEmail() @MaxLength(254)
  email!: string;

  @Matches(/^\d{6}$/, { message: 'The code is 6 digits' })
  code!: string;

  @IsString() @MinLength(8) @MaxLength(128)
  newPassword!: string;
}
