import { appApi } from "./api";

export async function runProtectedAction({ actionId, buttonId, context, onAllowed, announce }) {
  const result = await appApi.checkPermission({ actionId, buttonId, context });
  if (!result?.available) {
    announce?.({ type: "warning", message: result?.message || "此功能暂时无法使用。" });
    return false;
  }
  await onAllowed(result);
  return true;
}
