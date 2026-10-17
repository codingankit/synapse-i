export type IngestResult =
  | { success: true; fileName: string; atomsIngested: number }
  | { success: false; error: string; stage: string; code?: string };

export type IngestionErrorCode =
  | "PARSER_TIMEOUT"
  | "PARSER_PROVIDER_ERROR"
  | "PARSER_EMPTY_RESULT"
  | "INVALID_FILE_FORMAT"
  | "CONFIG_ERROR"
  | "UNKNOWN_INGESTION_ERROR";

export class IngestionError extends Error {
  constructor(
    message: string,
    public code: IngestionErrorCode,
    public rawError?: any,
  ) {
    super(message);
    this.name = "IngestionError";
  }
}

export * from "./brand.type";
