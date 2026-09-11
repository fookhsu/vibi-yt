# Ship official data only, and make derived metrics a user-gated capability

**Status**: accepted

YouTube Developer Policies §III.E.5 forbids an API Client from using API Data to create new or derived data or metrics — its own example is "a score that factors in likes, total views, or any other API Data" — and the 2026-06-01 Analytics & Reporting amendment is what legalises such metrics, per project, on request. The Quality lane's natural signals (interaction rate, comment depth, publisher authority, momentum) are exactly that kind of derived metric. So v1 ships **only official single-response ordering and raw statistics**, and the derived-metric Quality is built but **off by default**, enabled only by an explicit user action, on the understanding that the user's own Google Cloud project holds the amendment and carries the responsibility. vibi-yt neither applies nor verifies.

## Considered options

- **No derived metrics at all.** Smallest compliance surface, but it throws away the Quality lane the destination asks for and leaves the amendment permanently unused.
- **Gate the whole Quality lane on the amendment.** Rejected: it binds the implementation spec to an external grant that is not guaranteed and that attaches to each user's project — an unpredictable blocker over which we have no control.
- **Derived metrics on by default.** Rejected: the plugin would put every user in breach on its default path, and the penalty (quota reduction up to API access termination) lands on that user's own project. "Personal use" and "we won't publish the derived data" are not exemptions: the policy forbids *creating* the metric, and it has no non-commercial carve-out.
- **Chosen: build it, default off, user opt-in.** The user's premise — bring your own key, run it yourself, own your risk — becomes the switch's semantics rather than a silent default.

## Consequences

- **The default Digest is Trending-only.** Quality's default composition is a G4 decision, constrained by G0: no API-derived metric, and no re-ranking of the search pool until written confirmation.
- **Opting in does not license everything.** The search-results clause ("must not modify or replace the text, images, information, or other content of, the search results") is separate from the amendment; enabling derived metrics does not lift it. Quality candidates should therefore come from non-search sources (e.g. Subscription uploads) until YouTube confirms otherwise in writing.
- **v1 stores no third-party statistics snapshots.** 72h momentum needs only a `now` and a `now − 72h` point, so pre-approval sampling buys no time — it would only add a 30-day delete-or-refresh duty (§III.E.4) for data nothing is allowed to compute with.
- **Disclosure is mandatory, not cosmetic.** API Data shown alongside our own information must carry a clear and prominent "not from YouTube / part of our own product" notice, and derived scores are not persisted by default — they are recomputed per run.
- **If YouTube ever treats vibi-yt itself as the API Client**, the responsibility boundary moves from the user to the publisher; the opt-in notice names that risk rather than hiding it.
