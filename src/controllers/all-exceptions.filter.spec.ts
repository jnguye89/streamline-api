import {
  ArgumentsHost,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { AllExceptionsFilter } from './all-exceptions.filter';

function hostFor() {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status: (s: number) => {
      sent.status = s;
      return { json: (b: unknown) => (sent.body = b) };
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'POST', url: '/user/me/birthdate' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('passes an error code through to the client', () => {
    const { host, sent } = hostFor();
    filter.catch(
      new ForbiddenException({
        statusCode: 403,
        code: 'underage',
        message: 'Removed',
      }),
      host,
    );
    expect(sent).toEqual({
      status: 403,
      body: { statusCode: 403, message: 'Removed', code: 'underage' },
    });
  });

  it('keeps plain errors as status and message', () => {
    const { host, sent } = hostFor();
    filter.catch(new NotFoundException('User not found'), host);
    expect(sent.body).toEqual({ statusCode: 404, message: 'User not found' });
  });

  it('never logs a failed outgoing request’s headers', () => {
    const { host, sent } = hostFor();
    const axiosError = {
      message: 'Request failed with status code 403',
      config: {
        method: 'delete',
        url: 'https://tenant/api/v2/users/x',
        headers: { Authorization: 'Bearer SECRET' },
      },
      response: { status: 403, data: { message: 'Insufficient scope' } },
    };
    filter.catch(axiosError, host);
    const logged = JSON.stringify((console.error as jest.Mock).mock.calls);
    expect(logged).not.toContain('SECRET');
    expect(logged).toContain('Insufficient scope');
    expect(sent.status).toBe(500);
  });
});
