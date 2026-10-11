import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { availableProviders } from './provider-registry';

/**
 * Model Lab support: which providers are configured and ready.
 * Returns names and model IDs only — never credentials or key material.
 */
@ApiTags('ai-providers')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api/ai')
export class AiController {
  @Get('providers')
  @ApiOperation({ summary: 'List configured AI providers and their allowlisted models (no secrets)' })
  providers() {
    return { providers: availableProviders() };
  }
}
