import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSituationDto {
  @ApiProperty({ example: 'I have a lecture from 2–5:30pm, fellowship starts at 4:30pm…' })
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  text!: string;
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
}

export class ReassessDto {
  @ApiProperty({ example: "My assistant just said they can't cover the fellowship." })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  update_text!: string;
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
