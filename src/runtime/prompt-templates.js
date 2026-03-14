export function extractFactsPrompt(input = {}) {
  return [
    'Extract candidate facts for a structured memory system.',
    'Return strict JSON only with shape {"facts": [...]}.',
    'Prefer explicit user statements and confirmed decisions.',
    'Do not promote tentative speculation into facts.',
    '',
    JSON.stringify(input, null, 2),
  ].join('\n');
}

export function judgeFactsPrompt(input = {}) {
  return [
    'Judge extracted facts for a structured memory system.',
    'Return strict JSON only with shape {"result":{"items":[...]}}.',
    'Use conservative long-term memory standards.',
    'Default public policy is L1-only for apply-stage writes.',
    '',
    JSON.stringify(input, null, 2),
  ].join('\n');
}
