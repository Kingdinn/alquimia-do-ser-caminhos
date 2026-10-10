import type {SupabaseClient} from "@supabase/supabase-js";

export const IMAGE_BUCKET = "alquimia-vision";
export const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDatabaseError(error: unknown, message: string): boolean {
  return !!error && typeof error === "object" && "message" in error && error.message === message;
}

/** Save without the image first. Each phase is retryable, including after reload. */
export async function deleteUnusedImage(db: SupabaseClient, id: string): Promise<void> {
  const {data: key, error: beginError} = await db.rpc("alquimia_begin_image_delete", {image_id: id});
  if (beginError) throw beginError;
  if (!key) return;
  const {error: storageError} = await db.storage.from(IMAGE_BUCKET).remove([key]);
  if (storageError) throw storageError;
  const {data: finished, error: finishError} = await db.rpc("alquimia_finish_image_delete", {image_id: id});
  if (finishError) throw finishError;
  if (!finished) throw new Error("image_delete_incomplete");
}
