import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { StreamsService } from './streams.service';
import { CreateStreamDto, ClaimStreamDto, StreamQueryDto } from './streams.dto';

@Controller('streams')
@UseGuards(JwtAuthGuard)
export class StreamsController {
  constructor(private readonly streams: StreamsService) {}

  @Post()
  create(@Body() dto: CreateStreamDto, @Request() req: any) {
    return this.streams.create(dto, req.user.walletAddress);
  }

  @Get()
  findMine(@Query() query: StreamQueryDto, @Request() req: any) {
    return this.streams.findByWallet(req.user.walletAddress, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.streams.findOne(id);
  }

  @Get(':id/claimable')
  getClaimable(@Param('id') id: string) {
    return this.streams.getClaimableAmount(id);
  }

  @Patch(':id/claim')
  claim(@Param('id') id: string, @Body() dto: ClaimStreamDto) {
    return this.streams.recordClaim(id, dto.txHash);
  }

  @Patch(':id/pause')
  pause(@Param('id') id: string, @Request() req: any) {
    return this.streams.updateStatus(id, 'paused', req.user.walletAddress);
  }

  @Patch(':id/resume')
  resume(@Param('id') id: string, @Request() req: any) {
    return this.streams.updateStatus(id, 'active', req.user.walletAddress);
  }

  @Delete(':id')
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.streams.updateStatus(id, 'cancelled', req.user.walletAddress);
  }
}
