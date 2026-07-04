import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module.js';
import { EventController } from './event.controller.js';
import { EventService } from './event.service.js';

@Module({
  imports: [NotificationModule],
  controllers: [EventController],
  providers: [EventService],
})
export class EventModule {}
