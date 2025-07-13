import { Mapper } from '@automapper/core';
import { InjectMapper } from '@automapper/nestjs';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserIntegrationDto } from 'src/dto/user-integration.dto';
import { User_Integration } from 'src/entity/user-integration.entity';
import { IntegrationType } from 'src/enums/integration-type.enum';
import { Repository } from 'typeorm';

@Injectable()
export class UserIntegrationRepository {
  constructor(
    @InjectMapper() private readonly mapper: Mapper,
    @InjectRepository(User_Integration)
    private readonly userIntegrationRepo: Repository<User_Integration>,
  ) {}

  public async getUserIntegrationsByUserId(
    userId: string,
  ): Promise<UserIntegrationDto[]> {
    const userIntegrations = await this.userIntegrationRepo.find({
      where: { user: userId },
    });

    return this.mapper.mapArray(
      userIntegrations,
      User_Integration,
      UserIntegrationDto,
    );
  }
 
  public async getUserIntegrationByType(
    userId: string,
    integrationType: IntegrationType,
  ) {
    const userIntegration = await this.userIntegrationRepo.findOne({
      where: { user: userId, integrationType },
    });

    return this.mapper.map(
      userIntegration,
      User_Integration,
      UserIntegrationDto,
    );
  }

  public async createUserIntegration(
    userIntegrationDto: UserIntegrationDto,
  ): Promise<UserIntegrationDto> {
    const userIntegration = this.mapper.map(
      userIntegrationDto,
      UserIntegrationDto,
      User_Integration,
    );

    const savedUserIntegration =
      await this.userIntegrationRepo.save(userIntegration);

    return this.mapper.map(
      savedUserIntegration,
      User_Integration,
      UserIntegrationDto,
    );
  }
}
