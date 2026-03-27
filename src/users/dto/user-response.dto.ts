import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserPreferences, PrivacySettings } from '../../utils/type-validation.utils';

export class UserResponseDto {
  @ApiProperty({
    description: 'User unique identifier',
    example: 'user_abc123',
  })
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  lastName: string;

  @ApiPropertyOptional({
    description: 'Ethereum wallet address',
    example: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  })
  walletAddress?: string;

  @ApiPropertyOptional({
    description: 'User biography',
    example: 'Blockchain enthusiast and property investor.',
  })
  bio?: string;

  @ApiPropertyOptional({
    description: 'User location',
    example: 'London, UK',
  })
  location?: string;

  @ApiPropertyOptional({
    description: 'Avatar image URL',
    example: 'https://example.com/avatar.jpg',
  })
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'User preferences (JSON object)',
    example: '{ "theme": "dark", "notifications": true }',
    type: Object,
  })
  preferences?: UserPreferences;

  @ApiPropertyOptional({
    description: 'User privacy settings (JSON object)',
    example: '{ "profileVisible": true }',
    type: Object,
  })
  privacySettings?: PrivacySettings;

  @ApiPropertyOptional({
    description: 'Followers count',
    example: 10,
  })
  followersCount?: number;

  @ApiPropertyOptional({
    description: 'Following count',
    example: 5,
  })
  followingCount?: number;

  @ApiPropertyOptional({
    description: 'User activity count',
    example: 100,
  })
  activityCount?: number;

  @ApiPropertyOptional({
    description: 'User login count',
    example: 20,
  })
  loginCount?: number;

  @ApiProperty({
    description: 'Whether the user email is verified',
    example: true,
  })
  isEmailVerified: boolean;

  @ApiProperty({
    description: 'Whether the user account is active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'User roles',
    example: ['user'],
    type: [String],
  })
  roles: string[];

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2024-01-15T08:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-22T09:00:00.000Z',
  })
  updatedAt: Date;
}
