# Implement the capabilities instead of shelling out to yt-dlp

**Status**: accepted

`yt-dlp` is the reference tool for getting media *out* of YouTube, and it already answers two of vibi-yt's four capabilities — metadata and subtitles — so the cheapest-looking design for the rewrite was to wrap it: no Google Cloud project, no API key, no consent screen, no quota ceiling, no timedtext parser to maintain, and a thousand non-YouTube sites for free. We rejected that and **implemented the four capabilities in-process**. The reason is that the thing being built is not a YouTube client; it is a tool seam. yt-dlp's unit of work is a file on disk, and a file on disk is not something a model can hold. Everything the rewrite exists for — a JSON Schema the model can be handed, a handler returning structured data, a closed set of failure codes each carrying `hint` and `retryable`, an output bounded at 8,000 characters with a spill artifact — has to be manufactured on top of yt-dlp anyway. Once it is, what remains underneath is a subprocess, a parser, and a `--print` template to keep in sync with it.

## Considered options

- **Shell out to yt-dlp and parse its output.** Rejected: it relocates the interface problem into the core and makes it worse. There is no quoting to get wrong when there is no command line, no stdout to parse when there is no stdout, and no format drift to track when there is no `--dump-json` template — but all three reappear the moment yt-dlp becomes a subprocess. It also imports the failure model: exit codes and stderr are not a closed set, so `retryable` would have to be guessed.
- **Harvest credentials from a browser profile**, the way yt-dlp's `--cookies-from-browser` does. Rejected: it reads a live profile the user never handed over, and it breaks when YouTube rotates account cookies. Declared credentials — an API key in a `0600` file, or an OAuth token with a refresh path — are recoverable and revocable; a harvested cookie is neither.
- **Adopt yt-dlp's coverage as the target.** Rejected: playlists, channel catalogs, comments, chapters, format and codec inventories, live chat, `--download-archive`, SponsorBlock, a thousand sites. Taking on any of it means owning a scraping surface that rots on YouTube's schedule, and none of it is a *tool result*.

The overlap is real but narrow — metadata and subtitles — and inside it the difference is the interface, not the data source.

| | vibi-yt | yt-dlp |
| --- | --- | --- |
| Unit of work | A tool call returning structured data | A process writing files |
| Media download | None, by design | The whole point (`-f`, `-x`, `--audio-format`) |
| Reach for the model | Native tool schema and handler | Shell out, parse stdout/JSON |
| Credential model | API key or OAuth, per capability | Cookies copied out of a browser profile |
| Subscription channels | `youtube_subscriptions` (OAuth) | Not supported — `feed/subscriptions` is a *video* feed, not your channel list |
| Subtitles | `youtube_transcript`, timestamps per segment | `--write-subs` / `--write-auto-subs` |
| Metadata | 1–10 videos per call, one shape | `--dump-json`, one invocation per URL |
| Playlists, channels, formats, live chat | None | Extensive |
| Output size | Bounded: preview plus spill file over 8,000 chars | Whatever the file system takes |
| Failure reporting | Closed set of codes, each with a `hint` and `retryable` | Exit codes and stderr |
| Runtime cost | Node ≥22.19.0, already present for Pi | A Python or standalone binary |

Two rows carry the argument. **Subscription channels** are first-class here: the list you are subscribed to is a `subscriptions.list` call under OAuth, and yt-dlp has no extractor for it — `feed/subscriptions` is the recent-videos feed, so the closest yt-dlp equivalent is a cookie-authenticated feed scrape answering a different question. And **read-only is enforced, not promised**: no code path writes to YouTube, so a confused model cannot upload, comment, or subscribe. That is not a property a subprocess boundary confers.

## Consequences

- **Media is out of reach, permanently.** vibi-yt cannot hand back a single byte of audio or video. When the answer is a file, yt-dlp is the tool, and no amount of interface work changes that.
- **The user pays a provisioning cost yt-dlp does not charge.** An API key before the first call; a Google Cloud project and a consent screen before the fourth capability. That is the price of declared credentials.
- **Quota becomes a real ceiling.** 10,000 YouTube Data API v3 units per day by default, with `search.list` metered at 100 units per call — 100 searches is a day's budget. yt-dlp does not meter itself. The README states this as a limit rather than leaving it here.
- **Transcripts are the shared weak point, and the API cannot close it.** The Data API does expose captions, but `captions.download` requires permission to *edit* the video — it reads back only captions on videos the caller owns — and `captions.list` returns track metadata, never the text. There is therefore no official endpoint for a third party's transcript, which is why `youtube_transcript` reads the caption track the way yt-dlp does and inherits the same breakage class when YouTube changes the player or the timedtext endpoint. Search, details, and subscriptions use the documented API and do not.
- **One site, not a thousand.** The capability set is exactly what the seam was built for, and ADR 0002 is why the next host gets it without new work.
