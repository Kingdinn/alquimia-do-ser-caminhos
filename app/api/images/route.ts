import {createClient, currentUser} from "@/lib/supabase/server";
import {BodyTooLargeError, IMAGE_MAX_BYTES, readLimitedBody} from "@/lib/limits";
import {deleteUnusedImage, IMAGE_BUCKET, isDatabaseError} from "@/lib/image-storage";
import {checkRequestOwner} from "@/lib/request-owner";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({error: "Entre para abrir suas imagens."}, {status: 401});
  const ownerError = checkRequestOwner(req, user.id);
  if (ownerError) return ownerError;
  try {
    const db = await createClient();
    const [images, journal] = await Promise.all([
      db.from("alquimia_images").select("id,state").eq("owner", user.id).order("created_at"),
      db.from("alquimia_journals").select("body").eq("owner", user.id).maybeSingle(),
    ]);
    if (images.error) throw images.error;
    if (journal.error) throw journal.error;
    const savedImages = journal.data?.body?.images;
    const savedIds = new Set(Array.isArray(savedImages) ? savedImages.map((image: {id?: string}) => image.id) : []);
    return Response.json({unused: (images.data ?? []).filter(image => !savedIds.has(image.id))}, {
      headers: {"Cache-Control": "private, no-store"},
    });
  } catch {
    console.error("Could not list unused images");
    return Response.json({error: "Não foi possível abrir a lista de imagens. Tente novamente."}, {status: 503});
  }
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({error: "Entre para adicionar imagens."}, {status: 401});
  const ownerError = checkRequestOwner(req, user.id);
  if (ownerError) return ownerError;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return Response.json({error: "Origem não permitida."}, {status: 403});
  let reservedId: string | undefined;
  let db: Awaited<ReturnType<typeof createClient>> | undefined;
  try {
    const body = await readLimitedBody(req, IMAGE_MAX_BYTES + 64 * 1024);
    let form: FormData;
    try {
      form = await new Response(body as BodyInit, {headers: {"Content-Type": req.headers.get("content-type") ?? ""}}).formData();
    } catch {
      return Response.json({error: "Escolha um arquivo de imagem válido."}, {status: 400});
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 12 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return Response.json({error: "Escolha PNG, JPEG ou WebP de até 1 MB."}, {status: 400});
    }
    if (file.size > IMAGE_MAX_BYTES) throw new BodyTooLargeError();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valid = file.type === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : file.type === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)
        : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!valid) return Response.json({error: "Este arquivo não é uma imagem compatível."}, {status: 400});

    db = await createClient();
    const {data: reservation, error: reserveError} = await db.rpc("alquimia_reserve_image", {image_mime: file.type});
    if (reserveError) throw reserveError;
    if (!reservation?.id || !reservation?.object_key) throw new Error("image_reservation_failed");
    reservedId = reservation.id;
    const {error: uploadError} = await db.storage.from(IMAGE_BUCKET).upload(reservation.object_key, bytes, {contentType: file.type, upsert: false});
    if (uploadError) throw uploadError;
    const {data: ready, error: completeError} = await db.rpc("alquimia_complete_image", {image_id: reservedId});
    if (completeError) throw completeError;
    if (!ready) throw new Error("image_upload_incomplete");
    return Response.json({id: reservedId}, {status: 201});
  } catch (error) {
    if (reservedId && db) {
      try { await deleteUnusedImage(db, reservedId); }
      catch { console.error("Image reservation cleanup pending; available in unused images"); }
    }
    if (error instanceof BodyTooLargeError) return Response.json({error: "Use uma imagem de até 1 MB."}, {status: 413});
    if (isDatabaseError(error, "image_quota_exceeded")) {
      return Response.json({code: "image_quota_exceeded", error: "Sua conta comporta até 12 imagens. Exclua uma imagem fora do caderno salvo para adicionar outra."}, {status: 429});
    }
    console.error("Could not upload image");
    return Response.json({error: "Não foi possível adicionar a imagem. Tente novamente."}, {status: 503});
  }
}
