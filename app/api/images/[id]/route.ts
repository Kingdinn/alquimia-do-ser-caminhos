import {createClient, currentUser} from "@/lib/supabase/server";
import {deleteUnusedImage, IMAGE_BUCKET, IMAGE_ID, isDatabaseError} from "@/lib/image-storage";
import {checkRequestOwner} from "@/lib/request-owner";

type ImageRouteContext = {params: Promise<{id: string}>};

export async function GET(req: Request, {params}: ImageRouteContext) {
  const user = await currentUser();
  if (!user) return new Response("Entre com sua conta", {status: 401});
  const ownerError = checkRequestOwner(req, user.id);
  if (ownerError) return ownerError;
  try {
    const {id} = await params;
    if (!IMAGE_ID.test(id)) return new Response("Imagem não encontrada", {status: 404});
    const db = await createClient();
    const {data: row, error} = await db.from("alquimia_images").select("object_key,mime")
      .eq("id", id).eq("owner", user.id).eq("state", "ready").maybeSingle();
    if (error) throw error;
    if (!row) return new Response("Imagem não encontrada", {status: 404});
    const {data: object, error: downloadError} = await db.storage.from(IMAGE_BUCKET).download(row.object_key);
    if (downloadError || !object) return new Response("Imagem não encontrada", {status: 404});
    return new Response(object, {headers: {"Content-Type": row.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}});
  } catch {
    console.error("Could not read image");
    return new Response("Imagem indisponível", {status: 503});
  }
}

export async function DELETE(req: Request, {params}: ImageRouteContext) {
  const user = await currentUser();
  if (!user) return Response.json({error: "Entre para excluir uma imagem."}, {status: 401});
  const ownerError = checkRequestOwner(req, user.id);
  if (ownerError) return ownerError;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return Response.json({error: "Origem não permitida."}, {status: 403});
  const {id} = await params;
  if (!IMAGE_ID.test(id)) return Response.json({error: "Imagem não encontrada."}, {status: 404});
  try {
    await deleteUnusedImage(await createClient(), id);
    return new Response(null, {status: 204});
  } catch (error) {
    if (isDatabaseError(error, "image_in_use")) {
      return Response.json({code: "image_in_use", error: "Retire a imagem do caderno e salve antes de excluí-la."}, {status: 409});
    }
    console.error("Image deletion pending; retry is safe");
    return Response.json({code: "image_delete_failed", error: "Não foi possível terminar a exclusão. Tente novamente."}, {status: 503});
  }
}
