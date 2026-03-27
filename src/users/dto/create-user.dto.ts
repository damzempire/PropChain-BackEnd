import { IsEmail, IsString, IsOptional, MinLength, IsNotEmpty, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEthereumAddress } from '../../common/validators/is-ethereum-address.validator';
import { IsStrongPassword } from '../../common/validators/is-strong-password.validator';
import { IsXssSafe } from '../../common/validators/xss.validator';
import { IsNotSqlInjection } from '../../common/validators/sql-injection.validator';
import { UserPreferences, PrivacySettings } from '../../utils/type-validation.utils';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
    maxLength: 255,
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @MaxLength(255, { message: 'Email must not exceed 255 characters' })
  @IsXssSafe({ message: 'Email contains potentially malicious content' })
  @IsNotSqlInjection({ message: 'Email contains potential SQL injection' })
  email: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    minLength: 1,
    maxLength: 50,
  })
  @IsString({ message: 'First name must be a string' })
  @IsNotEmpty({ message: 'First name is required' })
  @MinLength(1, { message: 'First name must not be empty' })
  @MaxLength(50, { message: 'First name must not exceed 50 characters' })
  @Matches(/^[a-zA-Z\s'-]+$/, {
    message: 'First name can only contain letters, spaces, hyphens, and apostrophes',
  })
  @IsXssSafe({ message: 'First name contains potentially malicious content' })
  @IsNotSqlInjection({ message: 'First name contains potential SQL injection' })
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    minLength: 1,
    maxLength: 50,
  })
  @IsString({ message: 'Last name must be a string' })
  @IsNotEmpty({ message: 'Last name is required' })
  @MinLength(1, { message: 'Last name must not be empty' })
  @MaxLength(50, { message: 'Last name must not exceed 50 characters' })
  @Matches(/^[a-zA-Z\s'-]+$/, {
    message: 'Last name can only contain letters, spaces, hyphens, and apostrophes',
  })
  @IsXssSafe({ message: 'Last name contains potentially malicious content' })
  @IsNotSqlInjection({ message: 'Last name contains potential SQL injection' })
  lastName: string;

  @ApiProperty({
    description: 'User password (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char)',
    example: 'SecureP@ss123',
    minLength: 8,
    maxLength: 128,
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @IsXssSafe({ message: 'Password contains potentially malicious content' })
  @IsNotSqlInjection({ message: 'Password contains potential SQL injection' })
  @IsStrongPassword()
  password: string;

  @ApiPropertyOptional({
    description: 'Ethereum wallet address',
    example: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  })
  @IsOptional()
  @IsEthereumAddress({ message: 'Invalid Ethereum wallet address format' })
  @IsXssSafe({ message: 'Wallet address contains potentially malicious content' })
  @IsNotSqlInjection({ message: 'Wallet address contains potential SQL injection' })
  walletAddress?: string;

  @ApiPropertyOptional({
    description: 'User biography',
    example: 'Blockchain enthusiast and property investor.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({
    description: 'User location',
    example: 'London, UK',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional({
    description: 'Avatar image URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'User preferences (JSON object)',
    example: '{ "theme": "dark", "notifications": true }',
    type: Object,
  })
  @IsOptional()
  @Type(() => Object)
  @ValidateNested()
  preferences?: UserPreferences;

  @ApiPropertyOptional({
    description: 'User privacy settings (JSON object)',
    example: '{ "profileVisible": true }',
    type: Object,
  })
  @IsOptional()
  @Type(() => Object)
  @ValidateNested()
  privacySettings?: PrivacySettings;
}
