import {createClient, currentUser} from "@/lib/supabase/server";
import {saveSchema} from "@/app/validation";
import {BodyTooLargeError, JOURNAL_MAX_BYTES, readLimitedBody} from "@/lib/limits";
import {isDatabaseError} from "@/lib/image-storage";
import {checkRequestOwner} from "@/lib/request-owner";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({error: "Entre com sua conta para abrir seu caderno."}, {status: 401});
  const ownerError = checkRequestOwner(req, user.id);
  if (ownerError) return ownerError;
  try {
    const db = await createClient();
    const {data: row, error} = await db.from("alquimia_journals").select("body,version").eq("owner", user.id).maybeSingle();
    if (error) throw error;
    return Response.json({ownerId: user.id, data: row?.body ?? null, version: row?.version ?? 0}, {headers: {"Cache-Control": "private, no-store"}});
  } catch {
    console.error("Could not read journal");
    return Response.json({error: "Não foi possível abrir seu caderno. Tente novamente."}, {status: 503});
  }
}

export async function PUT(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({error: "Sua sessão expirou. Exporte seu texto antes de entrar novamente."}, {status: 401});
  const ownerError = checkRequestOwner(req, user.id);
  if (ownerError) return ownerError;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return Response.json({error: "Origem não permitida."}, {status: 403});
  try {
    const raw = await readLimitedBody(req, JOURNAL_MAX_BYTES + 64 * 1024);
    let parsed;
    try { parsed = saveSchema.safeParse(JSON.parse(new TextDecoder().decode(raw))); }
    catch { return Response.json({error: "Formato de caderno inválido."}, {status: 400}); }
    if (!parsed.success) return Response.json({error: "Revise os limites dos textos, as datas, os horários e a duração dos compromissos antes de salvar."}, {status: 400});
    const {data, version} = parsed.data;
    if (new TextEncoder().encode(JSON.stringify(data)).byteLength > JOURNAL_MAX_BYTES) throw new BodyTooLargeError();
    const db = await createClient();
    const imageIds = [...new Set(data.images.map(image => image.id))];
    if (imageIds.length) {
      const {data: found, error} = await db.from("alquimia_images").select("id")
        .eq("owner", user.id).eq("state", "ready").in("id", imageIds);
      if (error) throw error;
      if (found?.length !== imageIds.length) return Response.json({code: "image_not_available", error: "Uma imagem não está mais disponível para este caderno. Exporte suas alterações antes de recarregar."}, {status: 409});
    }
    const {data: saved, error} = await db.rpc("alquimia_save_journal", {payload: data, expected_version: version});
    if (error) throw error;
    if (!saved) return Response.json({error: "Outra aba salvou uma versão nova. Exporte suas alterações antes de recarregar para comparar."}, {status: 409});
    return Response.json({version: saved});
  } catch (error) {
    if (error instanceof BodyTooLargeError || isDatabaseError(error, "journal_too_large")) {
      return Response.json({code: "journal_too_large", error: "O caderno ultrapassou 600 KB. Exporte uma cópia e reduza os textos ou registros antes de salvar."}, {status: 413});
    }
    if (isDatabaseError(error, "image_not_available")) {
      return Response.json({code: "image_not_available", error: "Uma imagem foi removida em outra aba. Exporte suas alterações antes de recarregar."}, {status: 409});
    }
    console.error("Could not save journal");
    return Response.json({error: "Não foi possível salvar. Suas alterações continuam nesta tela."}, {status: 503});
  }
}
