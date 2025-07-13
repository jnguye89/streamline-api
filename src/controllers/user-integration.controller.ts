import { Body, Controller, Get, NotFoundException, Post } from '@nestjs/common';
import { Public } from 'src/auth/public.decorator';
import { User } from 'src/auth/user.decorator';
import { UserDto } from 'src/dto/user.dto';
import { IntegrationType } from 'src/enums/integration-type.enum';
import { VoxAuthService } from 'src/services/third-party/vox-auth.service';
import { VoximplantService } from 'src/services/third-party/voximplant.service';
import { UserIntegrationService } from 'src/services/user-integration.service';
import { v4 as uuidv4 } from 'uuid';
import md5 from 'md5'; // package “md5”

@Controller('user/integration')
export class UserIntegrationController {
  constructor(
    private userIntegrationService: UserIntegrationService,
    private voxAuthService: VoxAuthService,
    private voxImplantService: VoximplantService,
  ) {}

  @Get()
  @Public()
  async getUserIntegrationsByUserId(@User() user: UserDto) {
    return await this.userIntegrationService.getUserIntegrationsByUserId(
      user.userId,
    );
  }

  @Get('token')
  @Public()
  getToken() {
    return { token: this.voxAuthService.getToken() };
  }

  @Get('voximplant')
  async getVoximplantIntegration(@User() user: UserDto) {
    const integration =
      await this.userIntegrationService.getUserIntegrationByType(
        user.userId,
        IntegrationType.VoxImplant,
      );

    if (!integration) {
      throw new NotFoundException(
        `VoxImplant integration not found for user ${user.userId}`,
      );
    }
    return integration;
  }

  @Post('voximplant/token')
  // @Public()
  async getOneTimeToken(@User() user: UserDto, @Body() dto: { key: string }) {
    let integrationuser =
      await this.userIntegrationService.getUserIntegrationByType(
        user.userId,
        IntegrationType.VoxImplant,
      );
    if (!integrationuser) {
      const voxImplantId = user.userId.split('|')[1]; // This should be replaced with actual logic to get the VoxImplant ID
      const password = uuidv4(); // Generate a random password for the VoxImplant user
      const { data }: { data: { user_id: string } } =
        await this.voxImplantService.createvoxImplantUser(
          voxImplantId,
          password,
        );
      // console.log(voxImplant);
      const ha1 = md5(`${voxImplantId}:voximplant.com:${password}`) as string;
      console.log(ha1);
      const integrationDto = {
        user: user.userId,
        integrationUsername: voxImplantId, // This should be replaced with actual logic to get the integration username
        integrationId: data.user_id, // This should be replaced with actual logic to get the integration ID
        integrationType: IntegrationType.VoxImplant,
        ha1,
      };
      integrationuser =
        await this.userIntegrationService.createUserIntegration(integrationDto);
    }
    return {
      token: this.voxAuthService.getOneTimeToken(dto.key, integrationuser?.ha1),
    };
  }

  @Post('voximplant')
  async createVoximplantUserIntegration(@User() user: UserDto) {
    console.log(user);
    const existingUser =
      await this.userIntegrationService.getUserIntegrationByType(
        user.userId,
        IntegrationType.VoxImplant,
      );
    if (!existingUser) {
      const voxImplantId = user.userId.split('|')[1]; // This should be replaced with actual logic to get the VoxImplant ID
      const password = uuidv4(); // Generate a random password for the VoxImplant user
      const { data }: { data: { user_id: string } } =
        await this.voxImplantService.createvoxImplantUser(
          voxImplantId,
          password,
        );
      // console.log(voxImplant);
      const ha1 = md5(`${voxImplantId}:voximplant.com:${password}`) as string;
      console.log(ha1);
      const integrationDto = {
        user: user.userId,
        integrationUsername: voxImplantId, // This should be replaced with actual logic to get the integration username
        integrationId: data.user_id, // This should be replaced with actual logic to get the integration ID
        integrationType: IntegrationType.VoxImplant,
        ha1,
      };
      return await this.userIntegrationService.createUserIntegration(
        integrationDto,
      );
    }
    return existingUser;
  }

  // @Put('voximplant')
}
