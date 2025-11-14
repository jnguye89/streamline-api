import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserIntegrationDto } from 'src/dto/user-integration.dto';
import { User_Integration } from 'src/entity/user-integration.entity';
import { IntegrationType } from 'src/enums/integration-type.enum';
import { Repository } from 'typeorm';

@Injectable()
export class UserIntegrationRepository {
  constructor(
    @InjectRepository(User_Integration)
    private readonly userIntegrationRepo: Repository<User_Integration>,
  ) { }

  public async getUserIntegrationsByUserId(
    userId: string,
  ): Promise<UserIntegrationDto[]> {
    const userIntegrations = await this.userIntegrationRepo.find({
      where: { user: userId },
    });

    return [...userIntegrations.map(e => { return { ...e } as UserIntegrationDto })];
  }

  public async getUserIntegrationByType(
    userId: string,
    integrationType: IntegrationType,
  ): Promise<UserIntegrationDto> {
    const userIntegration = await this.userIntegrationRepo.findOne({
      where: { user: userId, integrationType },
    });

    return { ...userIntegration } as UserIntegrationDto;
  }

  public async createUserIntegration(
    userIntegrationDto: UserIntegrationDto,
  ): Promise<UserIntegrationDto> {
    const userIntegration = { ...userIntegrationDto };

    const savedUserIntegration =
      await this.userIntegrationRepo.save(userIntegration);

    return { ...savedUserIntegration };
  }
}
