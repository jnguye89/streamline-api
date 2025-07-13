import { Injectable } from '@nestjs/common';
import { UserIntegrationDto } from 'src/dto/user-integration.dto';
import { IntegrationType } from 'src/enums/integration-type.enum';
import { UserIntegrationRepository } from 'src/repositories/user-integration.repository';

@Injectable()
export class UserIntegrationService {
  constructor(private userIntegrationRepository: UserIntegrationRepository) {}

  getUserIntegrationsByUserId(userId: string): Promise<UserIntegrationDto[]> {
    return this.userIntegrationRepository.getUserIntegrationsByUserId(userId);
  }

  getUserIntegrationByType(
    userId: string,
    integrationType: IntegrationType,
  ): Promise<UserIntegrationDto | null> {
    return this.userIntegrationRepository.getUserIntegrationByType(
      userId,
      integrationType,
    );
  }

  createUserIntegration(
    userIntegrationDto: UserIntegrationDto,
  ): Promise<UserIntegrationDto> {
    return this.userIntegrationRepository.createUserIntegration(
      userIntegrationDto,
    );
  }
}
