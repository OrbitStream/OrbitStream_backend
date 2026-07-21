import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WebhookService } from './webhook.service';
import { MerchantsService } from '../merchants/merchants.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { IsArray, IsString, IsUrl } from 'class-validator';
import { IsNotInternalUrl } from '../merchants/is-not-internal-url.validator';

export class CreateWebhookEndpointDto {
  @IsUrl({}, { message: 'Invalid URL format' })
  @IsNotInternalUrl({
    message: 'Webhook URL must not point to a private or internal network address',
  })
  url: string;

  @IsArray()
  @IsString({ each: true })
  events: string[];
}

@Controller('v1/webhooks')
export class WebhookController {
  constructor(
    private readonly webhooks: WebhookService,
    private readonly merchants: MerchantsService,
  ) {}

  private async merchantIdFromJwt(req: any): Promise<string> {
    const merchant = await this.merchants.findByWallet(req.user.walletAddress);
    if (!merchant) throw new NotFoundException('Merchant not found');
    return merchant.id;
  }

  // ── SDK-facing endpoints (API key auth) ──

  @UseGuards(ApiKeyGuard)
  @Post()
  async createEndpoint(@Request() req: any, @Body() dto: CreateWebhookEndpointDto) {
    return this.webhooks.createEndpoint(req.merchantId, dto.url, dto.events);
  }

  @UseGuards(ApiKeyGuard)
  @Get()
  async listEndpoints(@Request() req: any) {
    return this.webhooks.listEndpoints(req.merchantId);
  }

  // ── Dashboard-facing endpoints (JWT auth) ──

  @UseGuards(AuthGuard('jwt'))
  @Get('deliveries')
  async listDeliveries(@Request() req: any, @Query('limit') limit?: string) {
    const merchantId = await this.merchantIdFromJwt(req);
    return this.webhooks.listDeliveries(merchantId, this.clampLimit(limit));
  }

  private clampLimit(limit?: string): number {
    const n = Number(limit);
    if (!Number.isFinite(n) || n <= 0) return 50;
    return Math.min(Math.floor(n), 100);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('dead-letter')
  async listDeadLetter(@Request() req: any) {
    const merchantId = await this.merchantIdFromJwt(req);
    return this.webhooks.listDeadLetters(merchantId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('dead-letter/:id/retry')
  async retryDeadLetter(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const merchantId = await this.merchantIdFromJwt(req);
    const result = await this.webhooks.retryDeadLetter(merchantId, id);
    if (!result) throw new NotFoundException('Dead-letter entry not found');
    return { status: 'requeued', ...result };
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('dead-letter/:id')
  async dismissDeadLetter(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const merchantId = await this.merchantIdFromJwt(req);
    const ok = await this.webhooks.dismissDeadLetter(merchantId, id);
    if (!ok) throw new NotFoundException('Dead-letter entry not found');
    return { status: 'dismissed' };
  }

  @UseGuards(ApiKeyGuard)
  @Delete(':id')
  async deleteEndpoint(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const ok = await this.webhooks.deleteEndpoint(req.merchantId, id);
    if (!ok) throw new NotFoundException('Webhook endpoint not found');
  }
}
