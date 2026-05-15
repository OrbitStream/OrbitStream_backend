import { IsString, IsNumber, IsNotEmpty, IsOptional, Min } from 'class-validator';

export class CreateStreamDto {
  @IsString() @IsNotEmpty() recipient: string;
  @IsString() @IsNotEmpty() tokenAddress: string;
  @IsNumber() @Min(0) ratePerSecond: number;
  @IsNumber() @Min(0) totalDeposited: number;
  @IsNumber() @IsOptional() durationSeconds?: number;
}

export class ClaimStreamDto {
  @IsString() @IsNotEmpty() txHash: string;
}

export class StreamQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() role?: 'sender' | 'recipient';
}
