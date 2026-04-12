import { IntegrationType } from 'src/enums/integration-type.enum';

export class UserIntegrationDto {
  id?: number;
  user: string;
  integrationUsername: string;
  ha1: string;
  integrationType: IntegrationType;
}
