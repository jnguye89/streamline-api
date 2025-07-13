import { AutoMap } from '@automapper/classes';
import { IntegrationType } from 'src/enums/integration-type.enum';

export class UserIntegrationDto {
  @AutoMap()
  id?: number;

  @AutoMap()
  user: string;

  @AutoMap()
  integrationUsername: string;

  @AutoMap()
  integrationId: string;

  @AutoMap()
  ha1: string;

  @AutoMap()
  integrationType: IntegrationType;
}
