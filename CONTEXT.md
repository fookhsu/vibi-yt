# vibi

A YouTube Data API v3 tool set for coding agents. It discovers videos, inspects their metadata, and reads their captions, then shapes all of it to fit an agent's context window.

## Language

### Videos

**Video input**:
A video reference supplied by a caller: either an 11-character video ID or a YouTube URL (watch, youtu.be, embed, shorts, or live).
_Avoid_: video URL, link (a URL is only one form of video input)

**Video details**:
The metadata and statistics for a single video: title, channel, publish date, duration, view/like/comment counts, and optionally the description.
_Avoid_: details, metadata (too broad, and `details` is ambiguous with the payload of a tool result)

**Search result**:
A lightweight pointer to a video returned by a query: video ID, title, channel, publish date, and a description snippet.
_Avoid_: hit, listing

### Transcripts

**Transcript**:
The caption track of a video in a requested language, as a sequence of timed segments.
_Avoid_: subtitles, captions (both are upstream terms, but this project says transcript)

**Transcript excerpt**:
The two windows of a transcript that matter most for orientation: the opening and the closing portion.
_Avoid_: key segments, key_segments, hook/outro (name the two windows separately)

**Hook**:
The opening window of a transcript excerpt.
_Avoid_: intro, opening

**Outro**:
The closing window of a transcript excerpt.
_Avoid_: ending, conclusion

**Full text**:
A whole transcript rendered as one continuous string, still subject to the output cap.
_Avoid_: raw transcript, full transcript (both suggest the uncapped original)

**Transcript diagnostic**:
The structured explanation returned in place of a transcript when one cannot be fetched: the attempted language, a reason code, and a suggested next action.
_Avoid_: transcript error (a diagnostic is returned, not raised)

### Credentials

**API key source**:
Where the YouTube Data API key came from: the environment, a stored login, or nowhere.
_Avoid_: auth mode, credential type
