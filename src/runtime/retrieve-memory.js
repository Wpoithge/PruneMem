export async function retrieveMemory(query, { backend } = {}) {
  if (!backend) throw new Error('backend is required');
  return backend.search(query, {});
}
