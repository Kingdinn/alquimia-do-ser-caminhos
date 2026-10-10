import JournalApp from "./journal";
import {currentUser, isConfigured} from "@/lib/supabase/server";
import {redirect} from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!isConfigured()) redirect("/entrar");
  const user = await currentUser();
  if (!user) redirect("/entrar");
  return <JournalApp ownerId={user.id}/>;
}
