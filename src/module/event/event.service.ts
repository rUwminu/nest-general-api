import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Event,
  EventInvite,
  EventJoinPolicy,
  EventParticipant,
  Prisma,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../lib/database/prisma.service.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { UpdateEventDto } from './dto/update-event.dto.js';
import { BanEventDto } from './dto/ban-event.dto.js';
import { UnbanEventDto } from './dto/unban-event.dto.js';

const ADMIN_ROLE = 'ADMIN';

const userSummarySelect = {
  id: true,
  name: true,
  image: true,
} satisfies Prisma.UserSelect;

const eventDetailInclude = {
  participants: { include: { user: { select: userSummarySelect } } },
  invites: { include: { user: { select: userSummarySelect } } },
} satisfies Prisma.EventInclude;

type EventDetail = Prisma.EventGetPayload<{
  include: typeof eventDetailInclude;
}>;

@Injectable()
export class EventService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEventDto, authorId: string): Promise<Event> {
    const joinPolicy = dto.joinPolicy ?? EventJoinPolicy.OPEN;
    const inviteUserIds = await this.sanitizeInviteUserIds(
      authorId,
      dto.inviteUserIds ?? [],
    );

    if (joinPolicy === EventJoinPolicy.INVITE_ONLY && !inviteUserIds.length) {
      throw new BadRequestException(
        'Invite-only events require at least one invited user',
      );
    }

    const event = await this.prisma.event.create({
      data: {
        name: dto.name,
        description: dto.description,
        startDate: dto.startsAt,
        endDate: dto.endsAt,
        isActive: dto.isActive,
        joinPolicy,
        authorId,
        invites: inviteUserIds.length
          ? { create: inviteUserIds.map((userId) => ({ userId })) }
          : undefined,
      },
    });

    return this.withComputedIsActive(event);
  }

  async findAll(userId: string, role: string): Promise<Event[]> {
    const events = await this.prisma.event.findMany({
      where: this.visibilityWhere(userId, role),
      orderBy: { createdAt: 'desc' },
    });

    return events.map((event) => this.withComputedIsActive(event));
  }

  async findOne(
    id: string,
    userId: string,
    role: string,
  ): Promise<
    Omit<EventDetail, 'invites'> & { invites?: EventDetail['invites'] }
  > {
    const event = await this.prisma.event.findFirst({
      where: { id, ...this.visibilityWhere(userId, role) },
      include: eventDetailInclude,
    });

    if (!event) {
      throw new NotFoundException(`Event with id ${id} not found`);
    }

    const isOwnerOrAdmin = event.authorId === userId || role === ADMIN_ROLE;

    return this.withComputedIsActive({
      ...event,
      invites: isOwnerOrAdmin ? event.invites : undefined,
    });
  }

  async update(
    id: string,
    dto: UpdateEventDto,
    userId: string,
  ): Promise<Event> {
    const event = await this.assertOwner(id, userId);
    const joinPolicy = dto.joinPolicy ?? event.joinPolicy;

    const targetUserIds =
      dto.inviteUserIds !== undefined
        ? await this.sanitizeInviteUserIds(userId, dto.inviteUserIds)
        : undefined;

    const resultingInviteCount =
      targetUserIds !== undefined
        ? targetUserIds.length
        : await this.prisma.eventInvite.count({ where: { eventId: id } });

    if (joinPolicy === EventJoinPolicy.INVITE_ONLY && !resultingInviteCount) {
      throw new BadRequestException(
        'Invite-only events require at least one invited user',
      );
    }

    if (targetUserIds !== undefined) {
      const operations = await this.buildInviteDiffOps(id, targetUserIds);

      if (operations.length) {
        await this.prisma.$transaction(operations);
      }
    }

    const updatedEvent = await this.prisma.event.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        startDate: dto.startsAt,
        endDate: dto.endsAt,
        isActive: dto.isActive,
        joinPolicy,
      },
    });

    return this.withComputedIsActive(updatedEvent);
  }

  async remove(id: string, userId: string): Promise<Event> {
    await this.assertOwner(id, userId);

    return this.prisma.event.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  async ban(id: string, adminId: string, dto: BanEventDto): Promise<Event> {
    const event = await this.findRaw(id);

    if (event.isBanned) {
      throw new BadRequestException('Event is already banned');
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.eventBanLog.create({
        data: { eventId: id, adminId, action: 'BANNED', reason: dto.reason },
      }),
      this.prisma.event.update({
        where: { id },
        data: { isBanned: true },
      }),
    ]);

    return this.withComputedIsActive(updated);
  }

  async unban(id: string, adminId: string, dto: UnbanEventDto): Promise<Event> {
    const event = await this.findRaw(id);

    if (!event.isBanned) {
      throw new BadRequestException('Event is not banned');
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.eventBanLog.create({
        data: {
          eventId: id,
          adminId,
          action: 'UNBANNED',
          reason: dto.reason,
        },
      }),
      this.prisma.event.update({
        where: { id },
        data: { isBanned: false },
      }),
    ]);

    return this.withComputedIsActive(updated);
  }

  async respondToInvite(
    eventId: string,
    userId: string,
    status: 'ACCEPTED' | 'DECLINED',
  ): Promise<EventInvite> {
    const event = await this.findRaw(eventId);

    if (event.isBanned) {
      throw new BadRequestException('This event is currently unavailable');
    }

    if (event.endDate.getTime() < Date.now()) {
      throw new BadRequestException('Event has already closed');
    }

    const invite = await this.prisma.eventInvite.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });

    if (!invite) {
      throw new NotFoundException('You have not been invited to this event');
    }

    if (status === 'DECLINED') {
      return this.prisma.eventInvite.update({
        where: { eventId_userId: { eventId, userId } },
        data: { status },
      });
    }

    const [, updatedInvite] = await this.prisma.$transaction([
      this.prisma.eventParticipant.upsert({
        where: { eventId_userId: { eventId, userId } },
        create: { eventId, userId },
        update: {},
      }),
      this.prisma.eventInvite.update({
        where: { eventId_userId: { eventId, userId } },
        data: { status },
      }),
    ]);

    return updatedInvite;
  }

  async join(eventId: string, userId: string): Promise<EventParticipant> {
    const event = await this.findRaw(eventId);

    if (event.isBanned) {
      throw new BadRequestException('This event is currently unavailable');
    }

    if (event.endDate.getTime() < Date.now()) {
      throw new BadRequestException('Event has already closed');
    }

    const existingParticipant = await this.prisma.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });

    if (existingParticipant) {
      return existingParticipant;
    }

    if (event.joinPolicy === EventJoinPolicy.INVITE_ONLY) {
      const invite = await this.prisma.eventInvite.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });

      if (!invite) {
        throw new ForbiddenException(
          'This event is invite-only and you have not been invited',
        );
      }
    }

    return this.prisma.eventParticipant.create({
      data: { eventId, userId },
    });
  }

  async syncInvites(
    eventId: string,
    ownerId: string,
    userIds: string[],
  ): Promise<EventInvite[]> {
    const event = await this.assertOwner(eventId, ownerId);
    const targetUserIds = await this.sanitizeInviteUserIds(ownerId, userIds);

    if (
      event.joinPolicy === EventJoinPolicy.INVITE_ONLY &&
      !targetUserIds.length
    ) {
      throw new BadRequestException(
        'Invite-only events require at least one invited user',
      );
    }

    const operations = await this.buildInviteDiffOps(eventId, targetUserIds);

    if (operations.length) {
      await this.prisma.$transaction(operations);
    }

    return this.prisma.eventInvite.findMany({ where: { eventId } });
  }

  private async buildInviteDiffOps(
    eventId: string,
    targetUserIds: string[],
  ): Promise<Prisma.PrismaPromise<unknown>[]> {
    const existingInvites = await this.prisma.eventInvite.findMany({
      where: { eventId },
      select: { userId: true },
    });
    const existingUserIds = new Set(
      existingInvites.map((invite) => invite.userId),
    );
    const targetUserIdSet = new Set(targetUserIds);

    const toAdd = targetUserIds.filter((id) => !existingUserIds.has(id));
    const toRemove = [...existingUserIds].filter(
      (id) => !targetUserIdSet.has(id),
    );

    return [
      ...(toRemove.length
        ? [
            this.prisma.eventInvite.deleteMany({
              where: { eventId, userId: { in: toRemove } },
            }),
          ]
        : []),
      ...(toAdd.length
        ? [
            this.prisma.eventInvite.createMany({
              data: toAdd.map((userId) => ({ eventId, userId })),
            }),
          ]
        : []),
    ];
  }

  private async sanitizeInviteUserIds(
    excludeUserId: string,
    userIds: string[],
  ): Promise<string[]> {
    const uniqueIds = [...new Set(userIds)].filter(
      (id) => id !== excludeUserId,
    );

    if (!uniqueIds.length) {
      return uniqueIds;
    }

    const existingUsers = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });

    if (existingUsers.length !== uniqueIds.length) {
      throw new BadRequestException('One or more invited users do not exist');
    }

    return uniqueIds;
  }

  private async assertOwner(id: string, userId: string): Promise<Event> {
    const event = await this.findRaw(id);

    if (event.authorId !== userId) {
      throw new ForbiddenException('You can only manage your own events');
    }

    return event;
  }

  private async findRaw(id: string): Promise<Event> {
    const event = await this.prisma.event.findFirst({
      where: { id, isDeleted: false },
    });

    if (!event) {
      throw new NotFoundException(`Event with id ${id} not found`);
    }

    return event;
  }

  private visibilityWhere(
    userId: string,
    role: string,
  ): Prisma.EventWhereInput {
    if (role === ADMIN_ROLE) {
      return { isDeleted: false };
    }

    return {
      isDeleted: false,
      OR: [
        { isBanned: false },
        { authorId: userId },
        { participants: { some: { userId } } },
      ],
    };
  }

  private withComputedIsActive<T extends { isActive: boolean; endDate: Date }>(
    event: T,
  ): T {
    return {
      ...event,
      isActive: event.isActive && event.endDate.getTime() > Date.now(),
    };
  }
}
