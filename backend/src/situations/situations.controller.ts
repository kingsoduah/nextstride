import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.guard';
import { CreateSituationDto, FeedbackDto, ReassessDto, UpdateSituationDto } from './dto';
import { SituationsService } from './situations.service';

@ApiTags('situations')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api/situations')
export class SituationsController {
  constructor(private readonly situations: SituationsService) {}

  @Post()
  @ApiOperation({ summary: 'Capture a situation (understand + detect conflicts)' })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateSituationDto) {
    return this.situations.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my recent situations (sidebar history)' })
  list(@CurrentUser() user: RequestUser) {
    return this.situations.listMine(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one situation with context and versions' })
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.situations.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit text (re-analyzes) or confirm understanding' })
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateSituationDto) {
    return this.situations.update(user.id, id, dto);
  }

  @Post(':id/prioritize')
  @ApiOperation({ summary: 'Generate a versioned recommendation (requires confirmed=true)' })
  prioritize(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.situations.prioritize(user.id, id);
  }

  @Get(':id/recommendations')
  @ApiOperation({ summary: 'List immutable recommendation versions' })
  recommendations(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.situations.recommendations(user.id, id);
  }

  @Post(':id/reassess')
  @ApiOperation({ summary: 'Reassess on new info (creates next version, preserves history)' })
  reassess(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ReassessDto) {
    return this.situations.reassess(user.id, id, dto);
  }

  @Post(':id/feedback')
  @ApiOperation({ summary: 'Record helpful / not helpful + optional note' })
  feedback(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: FeedbackDto) {
    return this.situations.feedback(user.id, id, dto);
  }
}
