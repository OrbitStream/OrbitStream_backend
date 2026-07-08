import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PaymentLinksService } from './payment-links.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { IsNumber, IsString, IsOptional, IsObject, Min, Max } from 'class-validator';

class CreatePaymentLinkDto {
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
  description?: string;

  @IsString()
  @IsOptional()
  displayCurrency?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsNumber()
  @IsOptional()
  expiresIn?: number;
}

@Controller('v1/payment-links')
@UseGuards(ApiKeyGuard)
export class PaymentLinksController {
  constructor(private readonly paymentLinksService: PaymentLinksService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreatePaymentLinkDto) {
    return this.paymentLinksService.create(req.merchantId, dto);
  }

  @Get()
  list(@Request() req: any) {
    return this.paymentLinksService.findAll(req.merchantId);
  }

  @Get(':id')
  get(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.paymentLinksService.findOne(req.merchantId, id);
  }
}
