export function defaultRuntimePolicy() {
  return {
    applyTargets: ['L1'],
    allowMemoryMdWrites: false,
    allowDailyNoteWrites: false,
  };
}
