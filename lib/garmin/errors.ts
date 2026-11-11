/** Server env needed for Garmin is missing (key secret, service role, ...). */
export class GarminNotConfiguredError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Garmin integration not configured: missing ${missing.join(', ')}`);
    this.name = 'GarminNotConfiguredError';
    this.missing = missing;
  }
}

/** Garmin rejected the API key / token (401/403): key invalid, deleted or expired. */
export class GarminAuthError extends Error {
  readonly status: number;
  constructor(status: number, message = 'Garmin rejected the API key') {
    super(message);
    this.name = 'GarminAuthError';
    this.status = status;
  }
}

export class GarminHttpError extends Error {
  readonly status: number;
  readonly path: string;
  constructor(status: number, path: string, body: string) {
    super(`Garmin ${status} on ${path}: ${body.slice(0, 200)}`);
    this.name = 'GarminHttpError';
    this.status = status;
    this.path = path;
  }
}
