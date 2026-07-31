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
  const doc =
    "mutation Delete { deletePost(input: { id: " +
    JSON.stringify(env.DELETE_POST_ID) +
    " }) { ... on PostActionSuccess { post { id } } ... on MutationError { message } } }";

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
  console.log(`deletePost: Buffer response: ${JSON.stringify(res.data)}`);
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
