/**
 * testTweet.ts — diagnostic: post ONE tweet to X, immediately, via the SECOND
 * Buffer account (BUFFER_API_KEY_2 / BUFFER_TWITTER_CHANNEL_ID). Reuses the most
 * recent generated tweet from history so it's real, on-brand content. Never
 * touches LinkedIn or Instagram.
 *
 * It exists to verify X publishing works end-to-end — including the open
 * question of whether Buffer's free plan even accepts X posts. It respects
 * DRY_RUN (nothing is sent when DRY_RUN is set); run with DRY_RUN unset/false to
 * actually post.
 */
import { env, twitterConfigured } from "../config/env";
import { logger } from "../services/logger";
import { loadHistory } from "../services/history";
import { publishPost } from "./publish";

async function main(): Promise<void> {
  if (!twitterConfigured || !env.BUFFER_API_KEY_2 || !env.BUFFER_TWITTER_CHANNEL_ID) {
    logger.error(
      "x-test: X is not configured — set BUFFER_API_KEY_2 and BUFFER_TWITTER_CHANNEL_ID."
    );
    process.exit(1);
  }

  const posts = loadHistory().posts;
  const latest = posts[posts.length - 1];
  const text =
    latest?.twitter.text ??
    "Testing our automated posting — we build simple, fast websites for small businesses. https://servio-0.web.app";

  logger.info(`x-test: posting this tweet to X now, via account #2${env.DRY_RUN ? " [DRY RUN — nothing sent]" : ""}:`);
  logger.info(text);

  const result = await publishPost({
    target: "twitter",
    channelId: env.BUFFER_TWITTER_CHANNEL_ID,
    text,
    apiKey: env.BUFFER_API_KEY_2,
  });

  if (result.ok) {
    logger.info(
      `x-test: SUCCESS — Buffer accepted the tweet (post id: ${result.postId ?? "queued"}). ` +
        "Check your X account / Buffer queue to see it."
    );
  } else {
    logger.error(`x-test: FAILED — Buffer rejected it: ${result.error}`);
    process.exit(1);
  }
}

void main();
