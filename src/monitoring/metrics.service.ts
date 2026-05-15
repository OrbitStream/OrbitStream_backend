import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly streamsCreated = new Counter({
    name: 'orbitstream_streams_created_total',
    help: 'Total streams created',
    registers: [this.registry],
  });

  readonly tokensClaimed = new Counter({
    name: 'orbitstream_tokens_claimed_total',
    help: 'Total token units claimed from streams',
    registers: [this.registry],
  });

  readonly activeStreams = new Counter({
    name: 'orbitstream_active_streams_total',
    help: 'Current active streams',
    registers: [this.registry],
  });

  readonly requestDuration = new Histogram({
    name: 'orbitstream_request_duration_seconds',
    help: 'Request duration in seconds',
    labelNames: ['method', 'path'],
    registers: [this.registry],
  });
}
