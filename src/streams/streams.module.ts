import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StreamsController } from './streams.controller';
import { StreamsService } from './streams.service';
import { StreamGateway } from './stream.gateway';
import { Stream } from './stream.entity';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [TypeOrmModule.forFeature([Stream]), StellarModule],
  controllers: [StreamsController],
  providers: [StreamsService, StreamGateway],
  exports: [StreamsService],
})
export class StreamsModule {}
