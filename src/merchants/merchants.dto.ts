import {
  IsString,
  IsEmail,
  IsOptional,
  IsUrl,
  IsArray,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const STELLAR_ADDRESS_REGEX = /^G[A-Z0-9]{55}$/;

export class RegisterMerchantDto {
  @IsString()
  @Matches(STELLAR_ADDRESS_REGEX, { message: 'Invalid Stellar address format' })
  walletAddress: string;

  @IsString()
  @MaxLength(255)
  businessName: string;

  @IsEmail({}, { message: 'Invalid email format' })
  email: string;
}

export class UpdateMerchantDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  businessName?: string;

  @IsEmail({}, { message: 'Invalid email format' })
  @IsOptional()
  email?: string;

  @IsUrl()
  @IsOptional()
  logoUrl?: string;
}

export class SetWebhookDto {
  @IsUrl({}, { message: 'Invalid URL format' })
  @ValidateIf(() => process.env.NODE_ENV === 'production')
  @Matches(/^https:\/\//, {
    message: 'Webhook URL must use HTTPS in production',
    groups: ['production'],
  })
  webhookUrl: string;
}

export class GenerateApiKeyDto {
  @IsString()
  @Matches(/^(testnet|mainnet)$/, { message: 'Environment must be testnet or mainnet' })
  environment: 'testnet' | 'mainnet';
}

export class SetCorsOriginsDto {
  @IsArray()
  @IsUrl({}, { each: true })
  origins: string[];
}
