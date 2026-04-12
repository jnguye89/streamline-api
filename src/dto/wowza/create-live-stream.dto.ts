export class CreateLiveStreamDto {
  aspect_ratio_height?: number = 720;      // default 720 if omitted
  aspect_ratio_width?: number = 1280;       // default 1280 if omitted
  billing_mode?: 'pay_as_you_go' | 'twentyfour_seven' = 'pay_as_you_go';
  broadcast_location: string = 'us_west_oregon';       // e.g., "us_west_oregon"
  encoder: string = 'other_webrtc';                  // e.g., "other_webrtc"
  name: string = 'MY LIVE STREAM';
  transcoder_type?: 'transcoded' | 'passthrough' = 'transcoded';
  delivery_method?: 'push' | 'pull' | 'cdn' = 'push'; // WebRTC requires "push"
  description?: string;
  recording: boolean = true;
}