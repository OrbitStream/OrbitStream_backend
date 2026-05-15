import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Stream, StreamStatus } from './stream.entity';
import { CreateStreamDto, StreamQueryDto } from './streams.dto';

@Injectable()
export class StreamsService {
  constructor(
    @InjectRepository(Stream)
    private readonly repo: Repository<Stream>,
  ) {}

  async create(dto: CreateStreamDto, sender: string): Promise<Stream> {
    const now = Math.floor(Date.now() / 1000);
    const stream = this.repo.create({
      sender,
      recipient:      dto.recipient,
      tokenAddress:   dto.tokenAddress,
      ratePerSecond:  dto.ratePerSecond,
      totalDeposited: dto.totalDeposited,
      status:         StreamStatus.ACTIVE,
      startTime:      now,
      endTime:        dto.durationSeconds ? now + dto.durationSeconds : null,
    });
    return this.repo.save(stream);
  }

  async findOne(id: string): Promise<Stream> {
    const stream = await this.repo.findOne({ where: { id } });
    if (!stream) throw new NotFoundException('Stream not found');
    return stream;
  }

  async findByWallet(walletAddress: string, query: StreamQueryDto) {
    const qb = this.repo.createQueryBuilder('s')
      .where('(s.sender = :w OR s.recipient = :w)', { w: walletAddress });

    if (query.status) qb.andWhere('s.status = :status', { status: query.status });
    if (query.role === 'sender')    qb.andWhere('s.sender = :w',    { w: walletAddress });
    if (query.role === 'recipient') qb.andWhere('s.recipient = :w', { w: walletAddress });

    return qb.orderBy('s.createdAt', 'DESC').getMany();
  }

  async getClaimableAmount(id: string): Promise<{ streamId: string; claimable: number; earned: number }> {
    const stream = await this.findOne(id);
    const now       = Math.floor(Date.now() / 1000);
    const effectiveNow = stream.endTime ? Math.min(now, Number(stream.endTime)) : now;
    const elapsed   = Math.max(0, effectiveNow - Number(stream.startTime));
    const earned    = elapsed * Number(stream.ratePerSecond);
    const claimable = Math.max(0, Math.min(earned - Number(stream.totalClaimed), Number(stream.totalDeposited) - Number(stream.totalClaimed)));
    return { streamId: id, claimable, earned };
  }

  async recordClaim(id: string, txHash: string): Promise<Stream> {
    const stream = await this.findOne(id);
    const { claimable } = await this.getClaimableAmount(id);
    stream.totalClaimed = Number(stream.totalClaimed) + claimable;
    stream.txHash = txHash;
    if (stream.endTime && Math.floor(Date.now() / 1000) >= Number(stream.endTime)) {
      stream.status = StreamStatus.COMPLETED;
    }
    return this.repo.save(stream);
  }

  async updateStatus(id: string, status: string, callerWallet: string): Promise<Stream> {
    const stream = await this.findOne(id);
    if (stream.sender !== callerWallet) throw new ForbiddenException('Only the sender can modify this stream');
    stream.status = status as StreamStatus;
    return this.repo.save(stream);
  }
}
