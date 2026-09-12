import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ContentType } from '../../../generated/prisma';

// Story 3.1: GET /content's query params. The API's first endpoint to use
// @Query() — main.ts's global ValidationPipe already has `transform: true`,
// so @Type(() => Number) coerces the query-string page/pageSize into numbers
// with no extra setup. `page`/`pageSize` default in the service (1/20), not
// here, since the service is what actually needs the concrete values.
export class QueryContentDto {
  @IsOptional()
  @IsEnum(ContentType)
  type?: ContentType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
