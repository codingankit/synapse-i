import LlamaCloud from "@llamaindex/llama-cloud";
import { llamaParsePrompt } from "../lib/prompts";
import { IngestionError } from "../types/ingest.type";

let llamaClient: LlamaCloud | undefined;
function getLlamaClient(): LlamaCloud {
  if (!llamaClient) {
    const apiKey = process.env.LLAMA_CLOUD_API_KEY;
    if (!apiKey) {
      throw new IngestionError(
        "LLAMA_CLOUD_API_KEY environment variable is not set.",
        "CONFIG_ERROR",
      );
    }
    llamaClient = new LlamaCloud({ apiKey });
  }
  return llamaClient;
}

const MAX_POLL_RETRIES = 60; // 3-minute timeout (60 * 3000ms)
const POLL_INTERVAL_MS = 3000;

export async function parseBrandBible(
  fileBuffer: Buffer,
  fileName: string,
): Promise<string> {
  const llamaClient = getLlamaClient();

  try {
    console.log(`[Parser] Uploading ${fileName} to LlamaCloud...`);

    const blobData = new Uint8Array(
      fileBuffer.buffer,
      fileBuffer.byteOffset,
      fileBuffer.byteLength,
    ) as unknown as any;

    const uploadFile = new File([blobData], fileName, {
      type: "application/octet-stream",
    });

    const file = await llamaClient.files.create({
      file: uploadFile,
      purpose: "parse",
    });

    console.log("[Parser] File uploaded successfully. File ID:", file.id);

    const job = await llamaClient.parsing.create({
      file_id: file.id,
      tier: "agentic",
      version: "latest",
      agentic_options: {
        custom_prompt: llamaParsePrompt,
      },
    });

    console.log("[Parser] Parse job created. Job ID:", job.id);

    let attempts = 0;

    while (attempts < MAX_POLL_RETRIES) {
      attempts++;

      const currentResult = await llamaClient.parsing.get(job.id, {
        expand: ["markdown_full"],
      });

      const status = currentResult.job.status;

      if (status === "COMPLETED") {
        console.log(
          `[Parser] Job COMPLETED. markdown_full length: ${currentResult?.markdown_full?.length ?? 0}`,
        );

        if (
          currentResult.markdown_full &&
          currentResult.markdown_full.trim().length > 0
        ) {
          return currentResult.markdown_full;
        }

        const pages = (currentResult as any).markdown?.pages;
        if (Array.isArray(pages) && pages.length > 0) {
          const assembledMarkdown = pages
            .map((p: any) => p.markdown || "")
            .join("\n\n");
          if (assembledMarkdown.trim().length > 0) {
            console.warn(
              "[Parser] markdown_full absent, assembled markdown from pages array.",
            );
            return assembledMarkdown;
          }
        }

        throw new IngestionError(
          `Parsing completed for ${fileName}, but no text or markdown content could be extracted.`,
          "PARSER_EMPTY_RESULT",
        );
      }

      if (status === "FAILED" || status === "CANCELLED") {
        const errorMsg =
          currentResult.job.error_message ||
          `Job terminated with status: ${status}`;
        throw new IngestionError(
          `LlamaCloud parsing failed: ${errorMsg}`,
          "PARSER_PROVIDER_ERROR",
        );
      }

      console.log(
        `[Parser] Processing document... (${status}) [Attempt ${attempts}/${MAX_POLL_RETRIES}]`,
      );

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    throw new IngestionError(
      `Parsing timed out after ${(MAX_POLL_RETRIES * POLL_INTERVAL_MS) / 1000} seconds.`,
      "PARSER_TIMEOUT",
    );
  } catch (err: any) {
    if (err instanceof IngestionError) {
      throw err;
    }

    console.error("[Parser] Unhandled exception during parseBrandBible:", err);
    throw new IngestionError(
      err.message ||
        "Failed to process document due to an unknown provider error.",
      "PARSER_PROVIDER_ERROR",
      err,
    );
  }
}
