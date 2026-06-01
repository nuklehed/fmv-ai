# Async queue with single-worker sequential AI processing

Assessments are processed asynchronously via a message queue. A single worker picks up submitted assessments sequentially, calls the local LLM (Qwen3.6-35B-a3b) to evaluate CV text against criteria, stores results with rationale, and updates assessment status. Local hosting eliminates external API costs and rate limits but introduces variable processing times based on available compute resources.

**Considered Options:**
- Synchronous AI call on submission (blocks HTTP connections during potentially long AI calls; risk of timeouts)
- Async queue with multiple concurrent workers (adds complexity for GPU contention management without throughput benefit when assessments are measured in per-hour, not per-second)
- Async queue with single worker (chosen — simpler, predictable processing times, no resource contention)

**Consequences:** The frontend must show queue position and estimated wait time to users. Processing is inherently sequential — if one assessment takes 5 minutes, the next one waits. This is acceptable because FMV assessments are not real-time operations; BUs expect hours, not seconds, for AI analysis.
