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
  InviteStatus,
  Prisma,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../lib/database/prisma.service.js';
import { NotificationService } from '../notification/notification.service.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { UpdateEventDto } from './dto/update-event.dto.js';
import { BanEventDto } from './dto/ban-event.dto.js';
import { UnbanEventDto } from './dto/unban-event.dto.js';
import { ListEventsQueryDto } from './dto/list-events-query.dto.js';

const ADMIN_ROLE = 'ADMIN';

export interface PaginatedResult<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  image: true,
} satisfies Prisma.UserSelect;

const eventDetailInclude = {
  participants: { include: { user: { select: userSummarySelect } } },
  invites: { include: { user: { select: userSummarySelect } } },
} satisfies Prisma.EventInclude;

type EventWithRelations = Prisma.EventGetPayload<{
  include: typeof eventDetailInclude;
}>;

type UserSummary = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;

type InvitedUserSummary = UserSummary & { isRemoveable: boolean };

export type EventWithUserLists = Omit<
  EventWithRelations,
  'participants' | 'invites'
> & {
  joinedUsers: UserSummary[];
  invitedUsers: InvitedUserSummary[];
  rejectedUsers?: UserSummary[];
  isJoinable: boolean;
};

@Injectable()
export class EventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

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

    await this.notifyInvited(event.id, authorId, inviteUserIds);

    return this.withComputedIsActive(event);
  }

  async findAll(
    userId: string,
    role: string,
    query: ListEventsQueryDto,
  ): Promise<PaginatedResult<EventWithUserLists>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.EventWhereInput = {
      AND: [
        this.visibilityWhere(userId, role),
        query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                {
                  description: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {},
      ],
    };

    const [total, events] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        include: eventDetailInclude,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: events.map((event) =>
        this.withComputedIsActive(
          this.toEventWithUserLists(event, userId, role),
        ),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(
    id: string,
    userId: string,
    role: string,
  ): Promise<EventWithUserLists> {
    const event = await this.prisma.event.findFirst({
      where: { id, ...this.visibilityWhere(userId, role) },
      include: eventDetailInclude,
    });

    if (!event) {
      throw new NotFoundException(`Event with id ${id} not found`);
    }

    return this.withComputedIsActive(
      this.toEventWithUserLists(event, userId, role),
    );
  }

  private toEventWithUserLists(
    event: EventWithRelations,
    viewerUserId: string,
    role: string,
  ): EventWithUserLists {
    const { participants, invites, ...rest } = event;
    const isOwnerOrAdmin =
      event.authorId === viewerUserId || role === ADMIN_ROLE;
    const isJoinable =
      event.joinPolicy !== EventJoinPolicy.INVITE_ONLY ||
      invites.some((invite) => invite.userId === viewerUserId);

    return {
      ...rest,
      isJoinable,
      joinedUsers: participants.map((participant) => participant.user),
      invitedUsers: invites
        .filter((invite) => invite.status !== InviteStatus.DECLINED)
        .map((invite) => ({
          ...invite.user,
          isRemoveable: invite.status !== InviteStatus.ACCEPTED,
        })),
      ...(isOwnerOrAdmin
        ? {
            rejectedUsers: invites
              .filter((invite) => invite.status === InviteStatus.DECLINED)
              .map((invite) => invite.user),
          }
        : {}),
    };
  }

  async update(
    id: string,
    dto: UpdateEventDto,
    userId: string,
  ): Promise<Event> {
    const event = await this.assertOwner(id, userId);
    const joinPolicy = dto.joinPolicy ?? event.joinPolicy;

    const resultingStartDate = dto.startsAt ?? event.startDate;
    const resultingEndDate = dto.endsAt ?? event.endDate;

    if (resultingEndDate.getTime() <= resultingStartDate.getTime()) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

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
      const { operations, toAdd } = await this.buildInviteDiffOps(
        id,
        targetUserIds,
      );

      if (operations.length) {
        await this.prisma.$transaction(operations);
      }

      await this.notifyInvited(id, userId, toAdd);
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
    this.assertJoinable(event);

    const invite = await this.prisma.eventInvite.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });

    if (!invite) {
      throw new NotFoundException('You have not been invited to this event');
    }

    if (status === 'DECLINED') {
      const updatedInvite = await this.prisma.eventInvite.update({
        where: { eventId_userId: { eventId, userId } },
        data: { status },
      });

      await Promise.all([
        this.notificationService.createResponseNotification(
          event.authorId,
          userId,
          eventId,
          status,
        ),
        this.notificationService.resolveInviteNotification(
          userId,
          eventId,
          status,
        ),
      ]);

      return updatedInvite;
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

    await Promise.all([
      this.notificationService.createResponseNotification(
        event.authorId,
        userId,
        eventId,
        status,
      ),
      this.notificationService.resolveInviteNotification(
        userId,
        eventId,
        status,
      ),
    ]);

    return updatedInvite;
  }

  async join(eventId: string, userId: string): Promise<EventParticipant> {
    const event = await this.findRaw(eventId);
    this.assertJoinable(event);

    const existingParticipant = await this.prisma.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });

    if (existingParticipant) {
      return existingParticipant;
    }

    const invite = await this.prisma.eventInvite.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });

    if (event.joinPolicy === EventJoinPolicy.INVITE_ONLY && !invite) {
      throw new ForbiddenException(
        'This event is invite-only and you have not been invited',
      );
    }

    if (invite && invite.status !== InviteStatus.ACCEPTED) {
      const [participant] = await this.prisma.$transaction([
        this.prisma.eventParticipant.create({
          data: { eventId, userId },
        }),
        this.prisma.eventInvite.update({
          where: { eventId_userId: { eventId, userId } },
          data: { status: InviteStatus.ACCEPTED },
        }),
      ]);

      await Promise.all([
        this.notificationService.createResponseNotification(
          event.authorId,
          userId,
          eventId,
          InviteStatus.ACCEPTED,
        ),
        this.notificationService.resolveInviteNotification(
          userId,
          eventId,
          InviteStatus.ACCEPTED,
        ),
      ]);

      return participant;
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

    const { operations, toAdd } = await this.buildInviteDiffOps(
      eventId,
      targetUserIds,
    );

    if (operations.length) {
      await this.prisma.$transaction(operations);
    }

    await this.notifyInvited(eventId, ownerId, toAdd);

    return this.prisma.eventInvite.findMany({ where: { eventId } });
  }

  private async notifyInvited(
    eventId: string,
    authorId: string,
    inviteUserIds: string[],
  ): Promise<void> {
    await Promise.all(
      inviteUserIds.map((userId) =>
        this.notificationService.createInviteNotification(
          userId,
          authorId,
          eventId,
        ),
      ),
    );
  }

  private async buildInviteDiffOps(
    eventId: string,
    targetUserIds: string[],
  ): Promise<{
    operations: Prisma.PrismaPromise<unknown>[];
    toAdd: string[];
  }> {
    const existingInvites = await this.prisma.eventInvite.findMany({
      where: { eventId },
      select: { userId: true, status: true },
    });
    const existingUserIds = new Set(
      existingInvites.map((invite) => invite.userId),
    );
    const targetUserIdSet = new Set(targetUserIds);

    const toAdd = targetUserIds.filter((id) => !existingUserIds.has(id));
    const toRemove = existingInvites
      .filter(
        (invite) =>
          invite.status !== InviteStatus.ACCEPTED &&
          !targetUserIdSet.has(invite.userId),
      )
      .map((invite) => invite.userId);

    const operations = [
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

    return { operations, toAdd };
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

  private assertJoinable(event: Event): void {
    if (event.isBanned) {
      throw new BadRequestException('This event is currently unavailable');
    }

    if (!event.isActive) {
      throw new BadRequestException('This event is currently paused');
    }

    if (event.endDate.getTime() < Date.now()) {
      throw new BadRequestException('Event has already closed');
    }
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
