import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum StreamStatus {
  ACTIVE    = 'active',
  PAUSED    = 'paused',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

@Entity('streams')
export class Stream {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() sender: string;
  @Column() recipient: string;
  @Column() tokenAddress: string;
  @Column('decimal', { precision: 18, scale: 7 }) ratePerSecond: number;
  @Column('decimal', { precision: 18, scale: 7 }) totalDeposited: number;
  @Column('decimal', { precision: 18, scale: 7, default: 0 }) totalClaimed: number;
  @Column({ nullable: true }) contractStreamId: string;
  @Column({ nullable: true }) txHash: string;
  @Column({ type: 'enum', enum: StreamStatus, default: StreamStatus.ACTIVE }) status: StreamStatus;
  @Column({ type: 'bigint', nullable: true }) startTime: number;
  @Column({ type: 'bigint', nullable: true }) endTime: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
