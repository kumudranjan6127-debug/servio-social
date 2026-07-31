/**
 * deletePost.ts — diagnostic: delete a Buffer post by id, via the second Buffer
 * account key (BUFFER_API_KEY_2). The post id comes from DELETE_POST_ID. Used to
 * clear a stuck/queued post without opening the Buffer dashboard.
 *
 * Prints the full Buffer response so both success and API-shape errors are
 * visible. Never touches LinkedIn / Instagram.
 */
import "dotenv/config";
import axios from "axios";
import { z } from "zod";

const BUFFER_ENDPOINT = "https://api.buffer.com";
const TIMEOUT_MS = 30_000;

const Env = z.object({
  BUFFER_API_KEY_2: z.string().min(10, "BUFFER_API_KEY_2 is required"),
  DELETE_POST_ID: z.string().trim().min(1, "DELETE_POST_ID is required"),
});

async function main(): Promise<void> {
  const env = Env.parse(process.env);
  // deletePost returns DeletePostPayload; __typename is always selectable and
  // the mutation still executes, so this both deletes and confirms.
  const doc =
    "mutation Delete { deletePost(input: { id: " +
    JSON.stringify(env.DELETE_POST_ID) +
    " }) { __typename } }";

  console.log(`deletePost: deleting ${env.DELETE_POST_ID} via account #2 ...`);
  const res = await axios.post(
    BUFFER_ENDPOINT,
    { query: doc },
    {
      headers: {
        Authorization: `Bearer ${env.BUFFER_API_KEY_2}`,
        "Content-Type": "application/json",
      },
      timeout: TIMEOUT_MS,
    }
  );
  const data = res.data as { errors?: { message: string }[] };
  if (data.errors && data.errors.length > 0) {
    console.error(`deletePost: Buffer rejected it — ${JSON.stringify(data.errors)}`);
    process.exit(1);
  }
  console.log(`deletePost: SUCCESS — deleted ${env.DELETE_POST_ID}. Response: ${JSON.stringify(res.data)}`);
}

main().catch((e: unknown) => {
  if (axios.isAxiosError(e)) {
    console.error(
      `deletePost: HTTP error — ${JSON.stringify(e.response?.data ?? e.message)}`
    );
  } else {
    console.error(`deletePost: failed — ${e instanceof Error ? e.message : String(e)}`);
  }
  process.exit(1);
});
