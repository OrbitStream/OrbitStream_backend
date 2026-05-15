import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WalletLoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async walletLogin(dto: WalletLoginDto) {
    const { walletAddress } = dto;
    if (!walletAddress?.startsWith('G')) {
      throw new UnauthorizedException('Invalid Stellar wallet address');
    }
    const payload = { sub: walletAddress, walletAddress };
    return { access_token: this.jwt.sign(payload), wallet: walletAddress };
  }
}
