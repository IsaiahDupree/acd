/**
 * Usage Parser
 * ============
 * Parses real token usage + cost from the `claude --output-format stream-json`
 * line stream. The CLI emits newline-delimited JSON; the terminal `result`
 * event carries cumulative `usage` (input_tokens, output_tokens, cache tokens)
 * and `total_cost_usd`. Per-turn `assistant` message events also carry
 * `message.usage`, which we use as a fallback when no `result.total_cost_usd`
 * is present.
 *
 * If a cost is not supplied by the CLI, we estimate from a small model→price
 * table (USD per 1M tokens) with a sane fallback so telemetry is never 0 when
 * tokens were actually consumed.
 */

// USD per 1,000,000 tokens. Keyed by substring match on the model id so it
// survives dated model suffixes (e.g. claude-sonnet-4-5-20250929).
// input = uncached input, cacheWrite = cache-creation, cacheRead = cache-hit, output.
const MODEL_PRICES = [
  { match: 'opus',   input: 15.0, cacheWrite: 18.75, cacheRead: 1.50,  output: 75.0 },
  { match: 'sonnet', input: 3.0,  cacheWrite: 3.75,  cacheRead: 0.30,  output: 15.0 },
  { match: 'haiku',  input: 0.80, cacheWrite: 1.00,  cacheRead: 0.08,  output: 4.0 },
];
const FALLBACK_PRICE = { input: 3.0, cacheWrite: 3.75, cacheRead: 0.30, output: 15.0 };

export function priceForModel(model) {
  if (!model) return FALLBACK_PRICE;
  const id = String(model).toLowerCase();
  for (const p of MODEL_PRICES) {
    if (id.includes(p.match)) return p;
  }
  return FALLBACK_PRICE;
}

/**
 * Estimate cost (USD) from token counts + a model price table.
 */
export function estimateCost(usage, model) {
  const p = priceForModel(model);
  const input      = usage.inputTokens || 0;
  const output     = usage.outputTokens || 0;
  const cacheRead  = usage.cacheReadTokens || 0;
  const cacheWrite = usage.cacheWriteTokens || 0;
  return (
    (input      * p.input)      +
    (output     * p.output)     +
    (cacheRead  * p.cacheRead)  +
    (cacheWrite * p.cacheWrite)
  ) / 1_000_000;
}

function addUsage(acc, u) {
  if (!u) return;
  // Treat each usage block as the authoritative cumulative figure for the
  // line that carried it; we keep the MAX seen so a final cumulative `result`
  // block isn't double-counted against earlier per-turn deltas.
  acc.inputTokens      = Math.max(acc.inputTokens,      u.input_tokens || 0);
  acc.outputTokens     = Math.max(acc.outputTokens,     u.output_tokens || 0);
  acc.cacheReadTokens  = Math.max(acc.cacheReadTokens,  u.cache_read_input_tokens || 0);
  acc.cacheWriteTokens = Math.max(acc.cacheWriteTokens, u.cache_creation_input_tokens || 0);
}

/**
 * Parse a single stream-json line object into the accumulator.
 * Recognized shapes:
 *   { type: 'result', usage: {...}, total_cost_usd, num_turns, modelUsage:{...} }
 *   { type: 'assistant', message: { usage: {...}, model } }
 */
function applyEvent(acc, evt) {
  if (!evt || typeof evt !== 'object') return;

  // assistant per-turn usage
  if (evt.type === 'assistant' && evt.message) {
    addUsage(acc, evt.message.usage);
    if (evt.message.model) acc.model = evt.message.model;
    acc.turnCount += 1;
  }

  // terminal result event — most authoritative
  if (evt.type === 'result') {
    addUsage(acc, evt.usage);
    if (typeof evt.total_cost_usd === 'number') acc.costUsd = evt.total_cost_usd;
    if (typeof evt.num_turns === 'number') acc.turnCount = Math.max(acc.turnCount, evt.num_turns);
    if (evt.modelUsage && typeof evt.modelUsage === 'object') {
      const ids = Object.keys(evt.modelUsage);
      if (ids.length && !acc.model) acc.model = ids[ids.length - 1];
    }
    acc.sawResult = true;
  }

  // system/init may announce the model
  if (evt.type === 'system' && evt.model && !acc.model) acc.model = evt.model;
}

/**
 * Parse the full captured stream-json output of one claude session.
 *
 * @param {string} output  raw stdout (+stderr) captured from the claude process
 * @param {string} [fallbackModel]  model id to use for cost estimation if the
 *                                  stream didn't name one
 * @returns {{ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
 *             totalTokens, costUsd, model, turnCount, sawResult, costEstimated }}
 */
export function parseUsage(output, fallbackModel = null) {
  const acc = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0,
    model: null,
    turnCount: 0,
    sawResult: false,
  };

  if (output && typeof output === 'string') {
    for (const raw of output.split('\n')) {
      const line = raw.trim();
      if (!line || line[0] !== '{') continue;
      // Quick filter to avoid JSON.parse on every plain log line.
      if (!line.includes('"usage"') && !line.includes('"type":"result"') &&
          !line.includes('"total_cost_usd"') && !line.includes('"type": "result"')) {
        continue;
      }
      let evt;
      try { evt = JSON.parse(line); } catch { continue; }
      applyEvent(acc, evt);
    }
  }

  const model = acc.model || fallbackModel || null;
  let costEstimated = false;
  let costUsd = acc.costUsd;
  const totalTokens = acc.inputTokens + acc.outputTokens +
                      acc.cacheReadTokens + acc.cacheWriteTokens;
  if ((!costUsd || costUsd <= 0) && totalTokens > 0) {
    costUsd = estimateCost(acc, model);
    costEstimated = true;
  }

  return {
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    cacheReadTokens: acc.cacheReadTokens,
    cacheWriteTokens: acc.cacheWriteTokens,
    totalTokens,
    costUsd,
    model,
    turnCount: acc.turnCount,
    sawResult: acc.sawResult,
    costEstimated,
  };
}

export default { parseUsage, estimateCost, priceForModel };
