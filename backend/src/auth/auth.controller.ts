import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { RequestUser } from './auth.guard';

@ApiTags('auth')
@Controller('api/session')
export class AuthController {
  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current authenticated user (Better Auth session)' })
  me(@CurrentUser() user: RequestUser) {
    return { user };
  }
}
