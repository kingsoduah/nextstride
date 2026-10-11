import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDecisionContextDto {
  @ApiPropertyOptional({
    description: 'IANA timezone the user reasons in (explicit request override). Falls back to Africa/Lagos.',
    example: 'Africa/Lagos',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ description: 'Manual model selection for evaluation (default: Auto). Validated against the server allowlist.' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  provider?: string;

  @ApiPropertyOptional({ description: 'Model id within the selected provider (default: provider default).' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;
}
