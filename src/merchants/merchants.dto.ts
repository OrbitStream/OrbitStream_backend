import { IsString, IsEmail, IsOptional, IsUrl, IsArray, ArrayMinSize } from 'class-validator';

export class RegisterMerchantDto {
  @IsString()
  walletAddress: string;

  @IsString()
  businessName: string;

  @IsEmail()
  email: string;
}

export class UpdateMerchantDto {
  @IsString()
  @IsOptional()
  businessName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsUrl()
  @IsOptional()
  logoUrl?: string;
}

export class SetWebhookDto {
  @IsUrl()
  webhookUrl: string;
}

export class GenerateApiKeyDto {
  @IsString()
  environment: 'testnet' | 'mainnet';
}

export class SetCorsOriginsDto {
  @IsArray()
  @IsString({ each: true })
  origins: string[];
}
