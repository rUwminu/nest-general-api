import { Controller, Get, Patch, Query } from '@nestjs/common';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import { auth } from '../../lib/auth/auth.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';
import { NotificationService } from './notification.service.js';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto.js';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  findPage(
    @Query() query: ListNotificationsQueryDto,
    @Session() session: UserSession<typeof auth>,
  ) {
    return this.notificationService.findPage(
      session.user.id,
      query.page ?? 1,
      query.limit ?? 10,
    );
  }

  @Get('unread-count')
  async getUnreadCount(@Session() session: UserSession<typeof auth>) {
    const count = await this.notificationService.getUnreadCount(
      session.user.id,
    );

    return { count };
  }

  @Patch('read-all')
  @ResponseMessage('Notifications marked as read')
  markAllRead(@Session() session: UserSession<typeof auth>) {
    return this.notificationService.markAllRead(session.user.id);
  }
}