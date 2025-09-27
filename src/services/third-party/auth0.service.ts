import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { firstValueFrom } from "rxjs";

@Injectable()
export class Auth0Service {

    private mgmtToken: string | null = null;
    private tokenExpiry: number = 0;

    constructor(private readonly http: HttpService) { }

    private async getToken(): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        if (this.mgmtToken && now < this.tokenExpiry - 60) {
            return this.mgmtToken;
        }
        const { data } = await firstValueFrom(this.http.post(
            `${process.env.AUTH0_MGMT_URL}/oauth/token`,
            {
                client_id: process.env.AUTH0_MGMT_CLIENT_ID,
                client_secret: process.env.AUTH0_MGMT_CLIENT_SECRET,
                audience: process.env.AUTH0_MGMT_AUDIENCE,
                grant_type: "client_credentials",
            },));
        this.mgmtToken = data.access_token;
        this.tokenExpiry = now + data.expires_in;
        return this.mgmtToken!;
    }

    async getUser(auth0UserId: string) {
        const token = await this.getToken();
        const { data } = await firstValueFrom(this.http.get(
            `${process.env.AUTH0_MGMT_URL}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
            {
                headers: { Authorization: `Bearer ${token}` },
            },
        ));

        return {
            auth0UserId: data.user_id,
            username: data.nickname ?? data.name ?? data.email,
            pictureUrl: data.picture,
        };
    }
}