import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: process.env.WS_CORS_ORIGIN ?? '*' } })
export class StreamGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(StreamGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe_stream')
  handleSubscribe(@MessageBody() streamId: string, @ConnectedSocket() client: Socket) {
    client.join(`stream:${streamId}`);
    return { event: 'subscribed', streamId };
  }

  @SubscribeMessage('unsubscribe_stream')
  handleUnsubscribe(@MessageBody() streamId: string, @ConnectedSocket() client: Socket) {
    client.leave(`stream:${streamId}`);
    return { event: 'unsubscribed', streamId };
  }

  emitStreamUpdate(streamId: string, data: any) {
    this.server.to(`stream:${streamId}`).emit('stream_update', { streamId, ...data });
  }

  emitClaimed(streamId: string, amount: number, recipient: string) {
    this.server.to(`stream:${streamId}`).emit('claimed', { streamId, amount, recipient });
  }

  emitStreamStatusChange(streamId: string, status: string) {
    this.server.to(`stream:${streamId}`).emit('status_change', { streamId, status });
  }
}
