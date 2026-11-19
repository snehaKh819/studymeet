const NONE = Object.freeze({
  isOwner: false,
  canView: false,
  canEdit: false,
  canRun: false,
  canManage: false,
});

/**
 * Single source of truth for "who can do what" with a workspace.
 * The REST API and (later) the collaboration server must both use this.
 *
 *                       PRIVATE   VIEW_ONLY   COLLABORATIVE
 *  owner                all       all         all
 *  room member          -         view        view
 *  granted editor       -         view        view + edit + run
 *
 * `workspace.editors` must be loaded. `isMember` = joined the room.
 */
export function computePermissions({ workspace, userId, isMember }) {
  if (workspace.ownerId === userId) {
    return { isOwner: true, canView: true, canEdit: true, canRun: true, canManage: true };
  }
  if (!isMember) return NONE;

  if (workspace.sharingMode === 'VIEW_ONLY') {
    return { ...NONE, canView: true };
  }
  if (workspace.sharingMode === 'COLLABORATIVE') {
    const isEditor = workspace.editors.some((e) => e.userId === userId);
    return { ...NONE, canView: true, canEdit: isEditor, canRun: isEditor };
  }
  return NONE; // PRIVATE
}
