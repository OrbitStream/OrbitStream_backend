import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RequestChallengeDto, VerifyChallengeDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  requestChallenge(@Body() dto: RequestChallengeDto) {
    return this.auth.requestChallenge(dto);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verifyChallenge(@Body() dto: VerifyChallengeDto) {
    return this.auth.verifyChallenge(dto);
  }

  /**
   * Exchange a valid (possibly previous-secret) token for a token signed with the
   * current secret. Enables zero-downtime JWT secret rotation.
   */
  @UseGuards(AuthGuard('jwt'))
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Request() req: any) {
    return this.auth.refresh(req.user);
  }
}
