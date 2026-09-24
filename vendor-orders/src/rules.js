// Role rules shared by the API (authoritative) and the UI (to hide buttons).
// Sales rep: add lines; edit/delete/approve their OWN lines while they are still
//            pending or ready. Purchaser: everything, plus ordering, receiving,
//            cutoffs, vendors, team roles and reset/clear.

export const REP_STATUSES = ["pending", "ready"];

export function isPurchaser(user) {
  return !!user && user.role === "purchaser";
}

export function canModifyLine(user, order) {
  if (!user || !order) return false;
  if (isPurchaser(user)) return true;
  return order.createdBy === user.id && REP_STATUSES.includes(order.status);
}

// Returns an error string, or "" when the patch is allowed.
export function checkPatch(user, order, patch) {
  if (!canModifyLine(user, order)) return "You can only change your own lines before they are ordered.";
  if (!isPurchaser(user) && patch.status && !REP_STATUSES.includes(patch.status)) {
    return "Only a Purchaser can mark lines ordered, received or backordered.";
  }
  return "";
}

export const CLEAR_HISTORY_PHRASE = "CLEAR HISTORY";
export const RESET_ALL_PHRASE = "RESET ALL DATA";
