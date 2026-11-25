// The REST routes talk to the live collaboration server through this object.
// Until the collaboration server is attached (e.g. in plain REST tests) every
// method is a harmless no-op, so the two halves stay decoupled.
export const hub = {
  async onWorkspaceChanged() {}, // permissions / mode / name / language changed
  async onWorkspaceDeleted() {},
  async workspacesChanged() {}, // tell everyone in the room to refresh their list
  async replaceCode() {
    return false; // false = not handled, caller writes to the DB itself
  },
  getLiveCode() {
    return null; // latest text if the workspace is being edited right now
  },
  broadcast() {},
  async presenceSummaries() {
    return {};
  },
};

export function installHub(impl) {
  Object.assign(hub, impl);
}
