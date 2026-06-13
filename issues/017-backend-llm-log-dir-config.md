# Issue #17 — LLM log directory should be configurable and safer

## Problem
In `services/worker.ts`:

```typescript
const LOG_DIR = process.env.LLM_LOG_DIR || path.join(process.cwd(), 'logs')
```

Issues:
- `path.join(process.cwd(), 'logs')` — in production, `cwd()` can be unpredictable (depends on how the process is started)
- No log rotation — daily log files will grow indefinitely
- Log files contain full LLM prompts which may include PII (HCP names, CV content)
- No permission checking on the log directory

## Files
- `apps/backend/src/services/worker.ts` — lines ~10–20

## Proposed Solution
1. **Default to `/tmp` or a configurable path**:
   ```typescript
   const LOG_DIR = process.env.LLM_LOG_DIR || '/tmp/fmv-ai-logs'
   ```

2. **Add log rotation** using `logrotate` config or a Node.js library like `rotating-file-stream`

3. **Add PII redaction** for log content — at minimum redact CV text body while keeping metadata (HCP name, score)

4. **Add log level config**:
   ```
   LOG_LEVEL=info  # or warn, error
   ```

## Acceptance Criteria
- Log directory defaults to a safe, predictable location
- Logs don't grow without bound (rotation or retention policy)
- CV text content is not logged in full (only metadata and response snippets)
- Configurable via environment variable
