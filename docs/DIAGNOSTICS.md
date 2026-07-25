# Diagnostic modes

The pipeline can be run manually from **Actions → Daily social post → Run
workflow**, choosing a `mode`. Several modes verify a single dependency without
publishing anything — useful for confirming setup or debugging.

| Mode | What it does | Posts? |
| --- | --- | --- |
| `daily` | The normal daily flow (generate → validate → image → publish/schedule). | Yes* |
| `week` | Generates and schedules 7 unique days ahead. | Yes* |
| `health` | Checks every dependency (env, Gemini, Buffer + channels, Cloudinary, history) and prints a table. | **No** |
| `channels` | Lists the Buffer channels connected to the account, with their IDs. | **No** |
| `models` | Lists the Gemini text models the key can call. | **No** |
| `gemini-image` | Probes available Gemini image models. | **No** |
| `cloudinary` | Runs the full image path (Cloudflare/fal generation → Cloudinary upload) and prints the hosted URL. | **No** |

\* The `dry_run` checkbox makes `daily`/`week` run the whole pipeline and log the
exact payloads **without sending anything** to Buffer.

## Which mode to use

- **"Is everything connected?"** → `health`
- **"What are my Buffer channel IDs?"** → `channels`
- **"Does image generation + hosting work?"** → `cloudinary`
- **"Which Gemini model will it use?"** → `models`
- **"Rehearse a real post safely"** → `daily` with `dry_run` checked

> Tip: trigger `dry_run` from the **web UI checkbox**, not the API — the boolean
> is passed correctly there, so a rehearsal can never accidentally publish.
