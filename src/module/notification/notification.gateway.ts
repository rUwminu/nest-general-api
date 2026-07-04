import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../lib/auth/auth.js';

function roomFor(userId: string): string {
  return `user:${userId}`;
}

@WebSocketGateway({
  cors: { origin: ['http://localhost:3000'], credentials: true },
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  private readonly server: Server;

  async handleConnection(client: Socket): Promise<void> {
    const userId = await this.authenticate(client);

    if (!userId) {
      client.disconnect(true);
      return;
    }

    client.data.userId = userId;
    await client.join(roomFor(userId));
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  emitUnreadCount(userId: string, count: number): void {
    this.server.to(roomFor(userId)).emit('notification:unread-count', {
      count,
    });
  }

  private async authenticate(client: Socket): Promise<string | null> {
    const authToken = client.handshake.auth?.token as string | undefined;
    const headerToken = client.handshake.headers?.authorization?.replace(
      /^Bearer\s+/i,
      '',
    );
    const token = authToken ?? headerToken;

    if (!token) {
      return null;
    }

    const headers = fromNodeHeaders({ authorization: `Bearer ${token}` });
    const session = await auth.api.getSession({ headers });

    return session?.user.id ?? null;
  }
}