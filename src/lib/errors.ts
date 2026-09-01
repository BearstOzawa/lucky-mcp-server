export class LuckyError extends Error {
  readonly code: string;

  constructor(message: string, code = "lucky") {
    super(message);
    this.name = "LuckyError";
    this.code = code;
  }
}

export class LuckyHttpError extends LuckyError {
  readonly status: number;
  readonly path: string;

  constructor(message: string, status: number, path: string) {
    super(message, "http");
    this.name = "LuckyHttpError";
    this.status = status;
    this.path = path;
  }
}
