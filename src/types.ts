/**
 * types.ts — the single source of truth for every shape that crosses a module
 * boundary. All modules import from here; none redefine these.
 */

// ---------------------------------------------------------------------------
// Content generation
// ---------------------------------------------------------------------------

/** The topic pool the system rotates through (see ai/chooseTopic.ts). */
export type TopicName = string;

export interface ChosenTopic {
  /** e.g. "Next.js" */
  topic: TopicName;
  /** A specific angle for today so the same topic never repeats the same idea. */
  angle: string;
  /** Why this topic was chosen (for the log). */
  reason: string;
}

/** One platform's finished text, produced by the AI and validated. */
export interface PlatformPost {
  text: string;
  hashtags: string[];
}

/** Everything the AI produces for one day. */
export interface GeneratedContent {
  topic: string;
  angle: string;
  /** Compact research notes the writer call was grounded with ("" if research skipped). */
  research: string;
  linkedin: PlatformPost;
  instagram: PlatformPost;
  /** Bonus: short X/Twitter version (not published yet — stored for later). */
  twitter: PlatformPost;
  /** Bonus: a blog draft in markdown (stored under data/blog-drafts/). */
  blogDraft: string;
  /** A prompt describing the branded image for today (for future AI image generators). */
  imagePrompt: string;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/**
 * Modular image sourcing. The default provider picks from the bundled branded
 * pool in assets/; a future provider can call an AI image generator instead.
 * Return null when no image can be provided (Instagram will then be skipped).
 */
export interface ImageProvider {
  name: string;
  getImage(content: GeneratedContent): Promise<LocalImage | null>;
}

export interface LocalImage {
  /** Absolute path to a local image file. */
  filePath: string;
  altText: string;
  /** True only when the pixels were AI-generated (drives Instagram's isAiGenerated flag). */
  aiGenerated: boolean;
}

/** A publicly reachable image, ready for Buffer's AssetInput. */
export interface HostedImage {
  url: string;
  altText: string;
  aiGenerated: boolean;
}

// ---------------------------------------------------------------------------
// Buffer
// ---------------------------------------------------------------------------

export type BufferService = string; // e.g. "linkedin", "instagram"

export interface BufferChannel {
  id: string;
  name: string;
  service: BufferService;
}

export type PublishTarget = "linkedin" | "instagram";

export interface PublishRequest {
  target: PublishTarget;
  channelId: string;
  text: string;
  /** Attached when the platform wants/needs an image (always for Instagram). */
  image?: HostedImage;
  /** When set, Buffer schedules for this exact UTC instant; otherwise publish via queue now. */
  dueAtIso?: string;
}

export interface PublishResult {
  target: PublishTarget;
  ok: boolean;
  /** Buffer's post id on success. */
  postId?: string;
  /** Buffer's scheduled time, if returned. */
  dueAt?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// History / dedup (data/posts.json)
// ---------------------------------------------------------------------------

export interface PostRecord {
  /** ISO date of the run, e.g. "2026-07-23". One record per day. */
  date: string;
  topic: string;
  angle: string;
  linkedin: {
    text: string;
    hashtags: string[];
    postId?: string;
    status: "published" | "scheduled" | "failed" | "skipped" | "dry-run";
  };
  instagram: {
    text: string;
    hashtags: string[];
    postId?: string;
    status: "published" | "scheduled" | "failed" | "skipped" | "dry-run";
  };
  twitter: { text: string; hashtags: string[] };
  imagePrompt: string;
  /** Public image URL used, if any. */
  imageUrl?: string;
  createdAtIso: string;
}

export interface HistoryFile {
  posts: PostRecord[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  field: string;
  problem: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  /** Highest similarity (0..1) found against recent history — regenerate when > threshold. */
  maxSimilarity: number;
  mostSimilarDate?: string;
}
