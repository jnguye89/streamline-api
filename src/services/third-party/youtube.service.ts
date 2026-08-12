import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { YoutubeVideoDto } from 'src/dto/youtube-video.dto';
import { LogService } from '../log.service';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const MAX_RESULTS_PER_CHANNEL = 25;

const CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;

function extractChannelIdFromUrl(value: string): string | undefined {
  return value.match(/youtube\.com\/channel\/(UC[\w-]{22})/i)?.[1];
}

function extractHandle(value: string): string | undefined {
  const urlMatch = value.match(/youtube\.com\/@([\w.-]+)/i);
  if (urlMatch) return urlMatch[1];
  return value.match(/^@([\w.-]+)$/)?.[1];
}

function extractLegacyUsername(value: string): string | undefined {
  return value.match(/youtube\.com\/(?:c|user)\/([\w.-]+)/i)?.[1];
}

@Injectable()
export class YoutubeService {
  private apiKey = process.env.YOUTUBE_API_KEY;

  constructor(private http: HttpService, private logService: LogService) { }

  /**
   * Turns whatever a user can easily copy/paste - a full channel URL, an
   * @handle, a legacy /c/ or /user/ name, or the raw UC... id itself - into
   * the actual channel id. Returns undefined (logged) if nothing matches.
   */
  async resolveChannelId(input: string): Promise<string | undefined> {
    const trimmed = input.trim();
    try {
      const directId = extractChannelIdFromUrl(trimmed) ?? (CHANNEL_ID_PATTERN.test(trimmed) ? trimmed : undefined);
      if (directId) return directId;

      const handle = extractHandle(trimmed);
      if (handle) {
        const id = await this.findChannelIdByHandle(handle);
        if (id) return id;
      }

      const username = extractLegacyUsername(trimmed);
      if (username) {
        const id = await this.findChannelIdByUsername(username);
        if (id) return id;
      }

      // Last resort: treat the whole input as a search query - covers plain
      // channel names and URL shapes we don't explicitly parse above.
      return await this.searchChannelId(handle ?? username ?? trimmed);
    } catch (err) {
      const e = err as AxiosError<any>;
      const message = e.response?.data ?? e.message ?? 'YouTube channel resolution failed';
      await this.logService.insertLog(JSON.stringify(message), `youtubeService.resolveChannelId:${trimmed}`);
      return undefined;
    }
  }

  /** Fetches a channel's display title and @handle for storage at creation time. */
  async getChannelSnippet(channelId: string): Promise<{ title?: string; handle?: string }> {
    try {
      const { data } = await firstValueFrom(
        this.http.get(`${YOUTUBE_API_BASE}/channels`, {
          params: { part: 'snippet', id: channelId, key: this.apiKey },
        }),
      );
      const snippet = data.items?.[0]?.snippet;
      return { title: snippet?.title, handle: snippet?.customUrl };
    } catch (err) {
      const e = err as AxiosError<any>;
      const message = e.response?.data ?? e.message ?? 'YouTube channel snippet fetch failed';
      await this.logService.insertLog(JSON.stringify(message), `youtubeService.getChannelSnippet:${channelId}`);
      return {};
    }
  }

  private async findChannelIdByHandle(handle: string): Promise<string | undefined> {
    const { data } = await firstValueFrom(
      this.http.get(`${YOUTUBE_API_BASE}/channels`, {
        params: { part: 'id', forHandle: handle, key: this.apiKey },
      }),
    );
    return data.items?.[0]?.id;
  }

  private async findChannelIdByUsername(username: string): Promise<string | undefined> {
    const { data } = await firstValueFrom(
      this.http.get(`${YOUTUBE_API_BASE}/channels`, {
        params: { part: 'id', forUsername: username, key: this.apiKey },
      }),
    );
    return data.items?.[0]?.id;
  }

  private async searchChannelId(query: string): Promise<string | undefined> {
    const { data } = await firstValueFrom(
      this.http.get(`${YOUTUBE_API_BASE}/search`, {
        params: { part: 'snippet', type: 'channel', q: query, maxResults: 1, key: this.apiKey },
      }),
    );
    return data.items?.[0]?.snippet?.channelId;
  }

  /** Fetches a channel's uploads, or [] (logged) if the channel/key is bad or the API call fails. */
  async listChannelVideos(channelId: string): Promise<YoutubeVideoDto[]> {
    try {
      const playlistId = await this.getUploadsPlaylistId(channelId);
      if (!playlistId) return [];
      return await this.listPlaylistVideos(playlistId);
    } catch (err) {
      const e = err as AxiosError<any>;
      const message = e.response?.data ?? e.message ?? 'YouTube channel fetch failed';
      await this.logService.insertLog(JSON.stringify(message), `youtubeService.listChannelVideos:${channelId}`);
      return [];
    }
  }

  private async getUploadsPlaylistId(channelId: string): Promise<string | undefined> {
    const { data } = await firstValueFrom(
      this.http.get(`${YOUTUBE_API_BASE}/channels`, {
        params: { part: 'contentDetails', id: channelId, key: this.apiKey },
      }),
    );
    return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  }

  private async listPlaylistVideos(playlistId: string): Promise<YoutubeVideoDto[]> {
    const { data } = await firstValueFrom(
      this.http.get(`${YOUTUBE_API_BASE}/playlistItems`, {
        params: {
          part: 'snippet',
          playlistId,
          maxResults: MAX_RESULTS_PER_CHANNEL,
          key: this.apiKey,
        },
      }),
    );

    const items = data.items ?? [];
    return items
      .filter((item: any) => item.snippet?.resourceId?.videoId)
      .map((item: any) => {
        const videoId = item.snippet.resourceId.videoId;
        return {
          externalId: videoId,
          title: item.snippet.title,
          thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
          watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
          // autoplay requires mute on most browsers; playsinline avoids iOS forcing native fullscreen.
          embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1`,
          publishedAt: item.snippet.publishedAt,
        } as YoutubeVideoDto;
      });
  }
}
