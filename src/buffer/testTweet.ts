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

  // Schedule ~4 minutes out (a concrete time, like the real daily flow) rather
  // than "add to queue" — a queued post waits for the channel's next queue slot
  // and can sit unposted if no schedule is set. A dueAt forces Buffer to publish
  // at that time, which is what actually verifies X goes live.
  const dueAtIso = new Date(Date.now() + 4 * 60 * 1000).toISOString();

  logger.info(
    `x-test: scheduling this tweet on X for ${dueAtIso} (~4 min), via account #2` +
      `${env.DRY_RUN ? " [DRY RUN — nothing sent]" : ""}:`
  );
  logger.info(text);

  const result = await publishPost({
    target: "twitter",
    channelId: env.BUFFER_TWITTER_CHANNEL_ID,
    text,
    apiKey: env.BUFFER_API_KEY_2,
    dueAtIso,
  });

  if (result.ok) {
    logger.info(
      `x-test: SUCCESS — Buffer scheduled the tweet (post id: ${result.postId ?? "?"}, ` +
        `dueAt ${result.dueAt ?? dueAtIso}). It should appear on X at that time — watch the account.`
    );
  } else {
    logger.error(`x-test: FAILED — Buffer rejected it: ${result.error}`);
    process.exit(1);
  }
}

void main();
