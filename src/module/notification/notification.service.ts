import { Injectable } from '@nestjs/common';
import {
  InviteStatus,
  NotificationType,
  Prisma,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../lib/database/prisma.service.js';
import { NotificationGateway } from './notification.gateway.js';

export interface PaginatedResult<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    unreadCount: number;
  };
}

const actorSelect = {
  id: true,
  name: true,
  image: true,
} satisfies Prisma.UserSelect;

const eventSummarySelect = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
} satisfies Prisma.EventSelect;

const notificationInclude = {
  actor: { select: actorSelect },
  event: { select: eventSummarySelect },
} satisfies Prisma.NotificationInclude;

type NotificationWithRelations = Prisma.NotificationGetPayload<{
  include: typeof notificationInclude;
}>;

export type NotificationListItem = NotificationWithRelations & {
  isNew: boolean;
};

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
  ) {}

  async createInviteNotification(
    recipientId: string,
    actorId: string,
    eventId: string,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        recipientId,
        actorId,
        eventId,
        type: NotificationType.INVITE,
      },
    });

    await this.pushUnreadCount(recipientId);
  }

  async createResponseNotification(
    recipientId: string,
    actorId: string,
    eventId: string,
    status: typeof InviteStatus.ACCEPTED | typeof InviteStatus.DECLINED,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        recipientId,
        actorId,
        eventId,
        type: NotificationType.RESPONSE,
        status,
        respondedAt: new Date(),
      },
    });

    await this.pushUnreadCount(recipientId);
  }

  async findPage(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<NotificationListItem>> {
    const [total, items] = await this.prisma.$transaction([
      this.prisma.notification.count({ where: { recipientId: userId } }),
      this.prisma.notification.findMany({
        where: { recipientId: userId },
        include: notificationInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const unreadIds = items
      .filter((notification) => !notification.isRead)
      .map((notification) => notification.id);

    if (unreadIds.length) {
      await this.prisma.notification.updateMany({
        where: { id: { in: unreadIds } },
        data: { isRead: true },
      });
    }

    const unreadCount = await this.getUnreadCount(userId);

    if (unreadIds.length) {
      this.gateway.emitUnreadCount(userId, unreadCount);
    }

    const unreadIdSet = new Set(unreadIds);

    return {
      items: items.map((notification) => ({
        ...notification,
        isRead: true,
        isNew: unreadIdSet.has(notification.id),
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    };
  }

  async markAllRead(userId: string): Promise<{ unreadCount: number }> {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, isRead: false },
      data: { isRead: true },
    });

    const unreadCount = await this.getUnreadCount(userId);
    this.gateway.emitUnreadCount(userId, unreadCount);

    return { unreadCount };
  }

  getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientId: userId, isRead: false },
    });
  }

  private async pushUnreadCount(userId: string): Promise<void> {
    const unreadCount = await this.getUnreadCount(userId);
    this.gateway.emitUnreadCount(userId, unreadCount);
  }
}