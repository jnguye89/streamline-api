import { S3Service } from './s3.service';

describe('S3Service.keyFor', () => {
  const env = { ...process.env };
  let s3: S3Service;

  beforeAll(() => {
    process.env.AWS_S3_BUCKET = 'my-bucket';
    process.env.AWS_REGION = 'us-west-1';
    s3 = new S3Service({} as never);
  });

  afterAll(() => {
    process.env = env;
  });

  it('returns a bare key as is', () => {
    expect(s3.keyFor('videos/original/a.mp4')).toBe('videos/original/a.mp4');
  });

  it('pulls the key out of this bucket’s public URL', () => {
    expect(
      s3.keyFor(
        'https://my-bucket.s3.us-west-1.amazonaws.com/avatars/a%20b.jpeg',
      ),
    ).toBe('avatars/a b.jpeg');
  });

  it('ignores URLs in other buckets or on other sites', () => {
    expect(
      s3.keyFor('https://other.s3.us-west-1.amazonaws.com/x.jpeg'),
    ).toBeNull();
    expect(s3.keyFor('https://s.gravatar.com/avatar/x.png')).toBeNull();
  });

  it('ignores empty values', () => {
    expect(s3.keyFor(null)).toBeNull();
    expect(s3.keyFor('  ')).toBeNull();
  });
});
