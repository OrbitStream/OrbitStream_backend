import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { StreamsModule } from './streams/streams.module';
import { StellarModule } from './stellar/stellar.module';
import { WebhookModule } from './webhook/webhook.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { StreamGateway } from './streams/stream.gateway';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    AuthModule,
    StreamsModule,
    StellarModule,
    WebhookModule,
    MonitoringModule,
  ],
  providers: [StreamGateway],
})
export class AppModule {}
