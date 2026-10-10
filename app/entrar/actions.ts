"use server";
import {createClient,isConfigured} from "@/lib/supabase/server";import {redirect} from "next/navigation";
export async function authenticate(form:FormData){if(!isConfigured())return {error:"O serviço de contas ainda não está conectado."};const mode=String(form.get("mode")),email=String(form.get("email")??"").trim(),password=String(form.get("password")??"");if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return {error:"Informe um e-mail válido."};if(!["login","signup","reset"].includes(mode))return {error:"Ação inválida."};if(mode!=="login"&&process.env.EMAIL_AUTH_READY!=="true")return {error:mode==="signup"?"Estamos finalizando a abertura dos cadastros.":"A recuperação por e-mail estará disponível em breve."};if(mode!=="reset"&&(password.length<8||password.length>128))return {error:"Use uma senha entre 8 e 128 caracteres."};const supabase=await createClient();const origin=process.env.NEXT_PUBLIC_SITE_URL;if(!origin)return {error:"O endereço da aplicação ainda não foi configurado."};try{if(mode==="reset"){const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${origin}/auth/callback?next=/redefinir-senha`});if(error)return {error:"Não foi possível enviar agora. Aguarde e tente novamente."};return {message:"Se houver uma conta para esse e-mail, você receberá um link para redefinir a senha."}}if(mode==="signup"){const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:`${origin}/auth/callback`}});if(error)return {error:"Não foi possível criar a conta. Confira os dados ou tente novamente mais tarde."};if(!data.session)return {message:"Confira seu e-mail para confirmar a conta. Se já tiver cadastro, entre ou recupere sua senha."}}else{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)return {error:"Não foi possível entrar. Confira e-mail e senha e confirme seu cadastro por e-mail."}}}catch{return {error:"O serviço de contas está indisponível. Tente novamente em instantes."}}redirect("/")}
export async function signOut(){const s=await createClient();await s.auth.signOut();redirect("/entrar")}
export async function resetPassword(form:FormData){if(process.env.EMAIL_AUTH_READY!=="true")return {error:"A recuperação por e-mail estará disponível em breve."};const password=String(form.get("password")??"");if(password.length<8||password.length>128)return {error:"Use uma senha entre 8 e 128 caracteres."};const s=await createClient();const {data}=await s.auth.getUser();if(!data.user)return {error:"Abra novamente o link enviado para seu e-mail."};const {error}=await s.auth.updateUser({password});if(error)return {error:"Não foi possível atualizar a senha. Solicite um novo link."};return {message:"Senha atualizada. Você já pode abrir seu caderno."}}

export async function signInWithGoogle(){
  if(process.env.GOOGLE_AUTH_ENABLED!=="true")return {error:"A entrada com Google estará disponível em breve."};
  if(!isConfigured())return {error:"O serviço de contas ainda não está conectado."};
  const origin=process.env.NEXT_PUBLIC_SITE_URL;
  if(!origin)return {error:"O endereço da aplicação ainda não foi configurado."};
  let authorizationUrl:string;
  try{
    const supabase=await createClient();
    const {data,error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:new URL("/auth/callback",origin).toString(),skipBrowserRedirect:true}});
    if(error||!data.url)return {error:"Não foi possível iniciar a entrada com Google. Tente novamente em instantes."};
    authorizationUrl=data.url;
  }catch{return {error:"Não foi possível iniciar a entrada com Google. Tente novamente em instantes."};}
  redirect(authorizationUrl);
}
