import { IsString, IsNumber, IsOptional, IsObject, Min, Max } from 'class-validator';

export class CreateSessionDto {
  @IsNumber()
  @Min(0.0000001)
  @Max(1000000)
  amount: number;

  @IsString()
  asset: string;

  @IsString()
  @IsOptional()
  assetIssuer?: string;

  @IsString()
  @IsOptional()
  successUrl?: string;

  @IsString()
  @IsOptional()
  cancelUrl?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class PublicSessionDto {
  id: string;
  url: string;
  amount: string;
  asset: string;
  status: string;
  expiresAt: Date;
}
