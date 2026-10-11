import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSituationDto {
  @ApiProperty({ example: 'I have a lecture from 2–5:30pm, fellowship starts at 4:30pm…' })
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  text!: string;

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

export class UpdateSituationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  text?: string;

  @ApiPropertyOptional({ description: 'Confirm the extracted understanding (required before prioritize)' })
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;

  @ApiPropertyOptional({
    description: 'Rename the situation in the sidebar. Normalized (trimmed, whitespace collapsed, control chars stripped). Never touches the situation text or its history.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;
}

export class ReassessDto {
  @ApiProperty({ example: "My assistant just said they can't cover the fellowship." })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  update_text!: string;

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

export class FeedbackDto {
  @ApiProperty()
  @IsBoolean()
  helpful!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
