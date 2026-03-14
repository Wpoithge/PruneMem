export function buildSessionPacket(input = {}) {
  return { schema_version: 'prunemem.session-packet.v1', ...input };
}
