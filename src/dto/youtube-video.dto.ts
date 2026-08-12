export class YoutubeVideoDto {
  externalId!: string;
  title!: string;
  thumbnailUrl?: string;
  /** youtube.com/watch?v=... — for a "view on YouTube" link, not for embedding. */
  watchUrl!: string;
  /** youtube.com/embed/... — the URL that's actually playable in an <iframe>. */
  embedUrl!: string;
  publishedAt?: string;
}
