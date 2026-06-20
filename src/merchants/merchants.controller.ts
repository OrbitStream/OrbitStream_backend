import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MerchantsService } from './merchants.service';
import {
  RegisterMerchantDto,
  UpdateMerchantDto,
  SetWebhookDto,
  GenerateApiKeyDto,
  SetCorsOriginsDto,
} from './merchants.dto';
import { ResourceOwnershipGuard, ResourceOwner } from '../auth/resource-ownership.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

@Controller('merchants')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Post('register')
  @UseGuards()
  register(@Body() dto: RegisterMerchantDto) {
    return this.merchants.register(dto.walletAddress, dto.businessName, dto.email);
  }

  @Get('me')
  getProfile(@Request() req: any) {
    return this.merchants.findByWallet(req.user.walletAddress);
  }

  @Patch('me')
  @Roles('admin', 'merchant')
  updateProfile(@Request() req: any, @Body() dto: UpdateMerchantDto) {
    return this.merchants.findByWallet(req.user.walletAddress).then((m) => {
      if (!m) throw new Error('Merchant not found');
      return this.merchants.update(m.id, dto);
    });
  }

  @Post('me/api-keys')
  @Roles('admin', 'merchant')
  generateApiKey(@Request() req: any, @Body() dto: GenerateApiKeyDto) {
    return this.merchants.findByWallet(req.user.walletAddress).then((m) => {
      if (!m) throw new Error('Merchant not found');
      return this.merchants.generateApiKey(m.id, dto.environment);
    });
  }

  @Get('me/api-keys')
  listApiKeys(@Request() req: any) {
    return this.merchants.findByWallet(req.user.walletAddress).then((m) => {
      if (!m) throw new Error('Merchant not found');
      return this.merchants.listApiKeys(m.id);
    });
  }

  @Delete('me/api-keys/:id')
  @Roles('admin', 'merchant')
  @UseGuards(ResourceOwnershipGuard)
  @ResourceOwner('api_key')
  revokeApiKey(@Request() req: any, @Param('id') keyId: string) {
    return this.merchants.findByWallet(req.user.walletAddress).then((m) => {
      if (!m) throw new Error('Merchant not found');
      return this.merchants.revokeApiKey(m.id, keyId);
    });
  }

  @Patch('me/webhook')
  @Roles('admin', 'merchant')
  setWebhook(@Request() req: any, @Body() dto: SetWebhookDto) {
    return this.merchants.findByWallet(req.user.walletAddress).then((m) => {
      if (!m) throw new Error('Merchant not found');
      return this.merchants.setWebhook(m.id, dto.webhookUrl);
    });
  }

  @Get('me/cors')
  getCorsOrigins(@Request() req: any) {
    return this.merchants.findByWallet(req.user.walletAddress).then((m) => {
      if (!m) throw new Error('Merchant not found');
      return this.merchants.getCorsOrigins(m.id);
    });
  }

  @Put('me/cors')
  @Roles('admin', 'merchant')
  setCorsOrigins(@Request() req: any, @Body() dto: SetCorsOriginsDto) {
    return this.merchants.findByWallet(req.user.walletAddress).then((m) => {
      if (!m) throw new Error('Merchant not found');
      return this.merchants.setCorsOrigins(m.id, dto.origins);
    });
  }
}
