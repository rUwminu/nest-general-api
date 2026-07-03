import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Roles, Session, UserSession } from '@thallesp/nestjs-better-auth';
import { auth } from '../../lib/auth/auth.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';
import { EventService } from './event.service.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { UpdateEventDto } from './dto/update-event.dto.js';
import { BanEventDto } from './dto/ban-event.dto.js';
import { UnbanEventDto } from './dto/unban-event.dto.js';
import { UpdateEventInvitesDto } from './dto/update-event-invites.dto.js';
import { RespondEventInviteDto } from './dto/respond-event-invite.dto.js';

@Controller('event')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Post()
  @ResponseMessage('Event created')
  create(
    @Body() dto: CreateEventDto,
    @Session() session: UserSession<typeof auth>,
  ) {
    return this.eventService.create(dto, session.user.id);
  }

  @Get()
  findAll(@Session() session: UserSession<typeof auth>) {
    return this.eventService.findAll(session.user.id, session.user.role);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Session() session: UserSession<typeof auth>,
  ) {
    return this.eventService.findOne(id, session.user.id, session.user.role);
  }

  @Patch(':id')
  @ResponseMessage('Event updated')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @Session() session: UserSession<typeof auth>,
  ) {
    return this.eventService.update(id, dto, session.user.id);
  }

  @Delete(':id')
  @ResponseMessage('Event deleted')
  remove(
    @Param('id') id: string,
    @Session() session: UserSession<typeof auth>,
  ) {
    return this.eventService.remove(id, session.user.id);
  }

  @Put(':id/invites')
  @ResponseMessage('Event invites updated')
  updateInvites(
    @Param('id') id: string,
    @Body() dto: UpdateEventInvitesDto,
    @Session() session: UserSession<typeof auth>,
  ) {
    return this.eventService.syncInvites(id, session.user.id, dto.userIds);
  }

  @Patch(':id/invite/respond')
  @ResponseMessage('Invite response recorded')
  respondToInvite(
    @Param('id') id: string,
    @Body() dto: RespondEventInviteDto,
    @Session() session: UserSession<typeof auth>,
  ) {
    return this.eventService.respondToInvite(id, session.user.id, dto.status);
  }

  @Post(':id/join')
  @ResponseMessage('Joined event')
  join(@Param('id') id: string, @Session() session: UserSession<typeof auth>) {
    return this.eventService.join(id, session.user.id);
  }

  @Post(':id/ban')
  @Roles(['ADMIN'])
  @ResponseMessage('Event banned')
  ban(
    @Param('id') id: string,
    @Body() dto: BanEventDto,
    @Session() session: UserSession<typeof auth>,
  ) {
    return this.eventService.ban(id, session.user.id, dto);
  }

  @Post(':id/unban')
  @Roles(['ADMIN'])
  @ResponseMessage('Event unbanned')
  unban(
    @Param('id') id: string,
    @Body() dto: UnbanEventDto,
    @Session() session: UserSession<typeof auth>,
  ) {
    return this.eventService.unban(id, session.user.id, dto);
  }
}
