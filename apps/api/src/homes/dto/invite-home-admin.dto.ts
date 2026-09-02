import { TrimEmail } from '../../common/decorators/trim.decorator';

export class InviteHomeAdminDto {
  @TrimEmail()
  email!: string;
}
