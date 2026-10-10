/** Protect an open journal from a session changed in another tab. Session auth and RLS remain authoritative. */
export function checkRequestOwner(request: Request, authenticatedOwner: string): Response | null {
  const expectedOwner = request.headers.get("X-Journal-Owner");
  // Older clients and normal image elements cannot supply this header.
  if (expectedOwner === null || expectedOwner === authenticatedOwner) return null;
  return Response.json({
    code: "account_changed",
    error: "A conta mudou em outra aba. Entre novamente na conta deste caderno e recarregue a página. Mantenha seu rascunho para recuperar as alterações.",
  }, {status: 403, headers: {"Cache-Control": "private, no-store"}});
}
