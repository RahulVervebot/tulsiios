// Shared state: tracks which callIds are currently being shown by CallKit native screen.
// IncomingCallOverlay checks this to avoid showing its own modal on top of CallKit.
const _callKitActiveIds = new Set();
export const markCallKitActive   = (id) => _callKitActiveIds.add(id);
export const unmarkCallKitActive = (id) => _callKitActiveIds.delete(id);
export const isCallKitActive     = (id) => _callKitActiveIds.has(id);
