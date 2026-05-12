/**
 * MCP error response helpers.
 *
 * §8 三段式语义：
 * - wrapStructuredResult: core 返回 { ok: false, ... } → 正常 tool 结果 (isError: false)
 * - wrapThrownError:     MCP 层无法继续 → isError: true
 * - McpError:            schema 校验失败等 protocol 级错误，通过 throw 交给 server 包装
 */

export function wrapStructuredResult(result) {
  return {
    content: [
      { type: 'text', text: JSON.stringify(result, null, 2) },
    ],
  };
}

export function wrapThrownError(err) {
  const message = err instanceof Error ? err.message : String(err);
  const errorObj = { ok: false, error: message };
  return {
    content: [
      { type: 'text', text: JSON.stringify(errorObj, null, 2) },
    ],
    isError: true,
  };
}
