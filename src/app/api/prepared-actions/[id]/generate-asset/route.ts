import { ok, serverError, validationError } from "@/lib/api/responses";
import { parseJsonBody } from "@/lib/validation/parse";
import { generatePreparedAssetSchema } from "@/lib/validation/prepared-actions";
import { getPreparedActionById, updatePreparedAction } from "@/lib/supabase/queries";
import { generatePreparedActionAsset } from "@/lib/prepared-actions/asset-writer";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const parsed = await parseJsonBody(request, generatePreparedAssetSchema);
    if (!parsed.success) {
      return validationError(parsed.error.message, parsed.error.issues);
    }

    const action = await getPreparedActionById(params.id);
    if (!action) {
      return validationError("Prepared action not found", [{ path: "id", message: "Unknown prepared action" }]);
    }

    const draftAsset = generatePreparedActionAsset(action, parsed.data.assetType);
    const nextAssets = [...(action.preparedAsset ?? [])].filter((asset) => asset.assetType !== draftAsset.assetType);
    nextAssets.push(draftAsset);

    const updated = await updatePreparedAction(action.id, { preparedAsset: nextAssets });
    if (!updated) {
      return serverError("Failed to save prepared asset");
    }

    return ok({ ok: true, asset: draftAsset, action: updated });
  } catch (error) {
    return serverError("Failed to generate prepared asset", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
