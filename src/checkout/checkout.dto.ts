import { IsString, IsNumber, IsOptional, IsObject, Min } from 'class-validator';

export class CreateSessionDto {
  @IsNumber()
  @Min(0.0000001)
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
