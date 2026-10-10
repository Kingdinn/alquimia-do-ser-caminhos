import { currentUser, isConfigured } from "@/lib/supabase/server";
import LoginView from "./login-view";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await currentUser();
  return <LoginView
    signedIn={Boolean(user)}
    userEmail={user?.email}
    configured={isConfigured()}
    googleEnabled={process.env.GOOGLE_AUTH_ENABLED === "true"}
    emailAuthReady={process.env.EMAIL_AUTH_READY === "true"}
  />;
}
