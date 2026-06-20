import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CreateSessionDto, PublicSessionDto } from './checkout.dto';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ResourceOwnershipGuard, ResourceOwner } from '../auth/resource-ownership.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

@Controller('v1/checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @UseGuards(ApiKeyGuard, RolesGuard)
  @Roles('admin', 'merchant')
  @Post('sessions')
  createSession(@Request() req: any, @Body() dto: CreateSessionDto) {
    return this.checkout.createSession(req.merchantId, dto);
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string): Promise<PublicSessionDto> {
    return this.checkout.getSession(id);
  }

  @UseGuards(ApiKeyGuard, RolesGuard, ResourceOwnershipGuard)
  @Roles('admin', 'merchant')
  @ResourceOwner('checkout_session')
  @Post('sessions/:id/cancel')
  cancelSession(@Request() req: any, @Param('id') id: string) {
    return this.checkout.cancelSession(id, req.merchantId);
  }
}
