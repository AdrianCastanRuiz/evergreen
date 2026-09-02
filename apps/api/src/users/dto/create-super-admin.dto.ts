import { TrimEmail } from '../../common/decorators/trim.decorator';

export class CreateSuperAdminDto {
  @TrimEmail()
  email!: string;
}
