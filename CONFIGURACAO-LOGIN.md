# Ativar as contas do grupo

Site publicado: https://alquimia-do-ser-caminhos.vercel.app/entrar
Projeto Supabase: sbujezhugcthqkchsqcf
Projeto Vercel: alquimia-do-ser-caminhos (DIN)

O banco e o armazenamento privado estão configurados. O proprietário criou o cliente OAuth no Google e salvou as credenciais diretamente no Supabase; o provedor Google está ativo. A flag de produção foi habilitada na Vercel e a publicação está READY, com alias canônico confirmado. O usuário confirmou que conseguiu entrar e mostrou o caderno autenticado; salvamento/reabertura continuam pendentes de validação. E-mail/senha continua como alternativa; os botões de criação de contas e recuperação por e-mail permanecem desativados na aplicação até a configuração de SMTP. Isso não equivale a desativar globalmente os cadastros no Supabase.

## Salvamento automático — publicado em 28/09/2026

Implementado para o caderno autenticado, sem mudanças nas credenciais, nos escopos Google ou nas permissões do banco. Deployment `dpl_EG3gdBYG9ZhiWpf3dTwP3dzv2PMk` READY e alias `https://alquimia-do-ser-caminhos.vercel.app` confirmado; build de produção e TypeScript passaram. As outras publicações registradas abaixo são anteriores a esta alteração.

- Salvamento no Supabase após aproximadamente um segundo sem editar, com envios serializados e controle de versão. “Salvar agora” também força o envio das alterações mais recentes.
- Rascunho local enquanto a confirmação da nuvem não chega, isolado por conta e por aba. Recuperação oferecida somente para a mesma conta neste navegador. Ao confirmar o salvamento, o rascunho correspondente é limpo; bloqueio ou falta de espaço local apresenta aviso. Não é garantia de cópia fora deste aparelho.
- Falhas transitórias têm tentativas limitadas; reconexão permite retomar. Sessão expirada ou troca de conta interrompe o salvamento até entrar novamente na conta correta. As APIs conferem `X-Journal-Owner` quando fornecido e respondem `account_changed` em caso de divergência, antes de ler ou modificar dados. O cabeçalho não substitui autenticação nem RLS.
- Uma versão nova em outra aba exige decisão explícita: abrir a versão salva ou manter as alterações locais. A comparação não deve substituir automaticamente o conteúdo da conta e preserva edições feitas enquanto busca a versão remota.
- O rascunho do registro diário faz parte do caderno em `checkinDraft`, inclusive com a data temporariamente vazia. Horários e durações incompletos da rotina permanecem no rascunho local e precisam ser corrigidos antes de sincronizar.
- Google Docs não faz parte deste fluxo. O login Google serve para identificar a conta; o armazenamento principal permanece no Supabase. A demonstração pública continua temporária, sem gravar cadernos no banco nem rascunhos locais persistentes.

Validação local concluída: `npm run test:autosave` passou com **27 testes** — 13 do coordenador de salvamento, 4 da proteção de troca de conta, 4 dos schemas e 6 do hook React real com HTTP e recursos do navegador simulados. `npm run typecheck` também passou. O teste da interface com contas reais continua pendente, incluindo salvar/reabrir, queda de conexão e recuperação, conflito entre abas, imagem e isolamento entre duas contas. A publicação não equivale a validação de ponta a ponta: o navegador recusou acesso por não conseguir verificar a política administrativa, sem contorno desse bloqueio.

## Verificação atual — 28/09/2026

- Banco `ACTIVE_HEALTHY`; o aviso de pausa por inatividade recebido em 27/09 não é uma pausa já ocorrida. Não foi contratado plano pago.
- Consulta agregada confirmou zero usuários, cadernos, metadados de imagens e arquivos neste projeto antes da abertura das contas. Advisors de segurança sem alertas.
- Consulta atual a `/auth/v1/settings` retornou HTTP 200 e confirmou `external.google=true`, `external.email=true` e `disable_signup=false`, após o proprietário salvar as credenciais no provedor Google.
- Google Cloud tem o projeto dedicado **Alquimia do Ser**, ID `tidy-bliss-510015-f7`, com suporte em `cortescora25@gmail.com`. O proprietário concluiu a criação do cliente OAuth e informou ter salvo as credenciais no Supabase. O print do Google mostrou audiência em **Testing**, com acesso restrito a usuários de teste; não há evidência de inclusão de test users nem de publicação para a audiência externa. Nenhum Client ID ou segredo é armazenado nesta documentação.
- **Corrigido no Supabase:** Site URL era `http://localhost:3000`; agora é `https://alquimia-do-ser-caminhos.vercel.app`. Allowlist tem o retorno exato `https://alquimia-do-ser-caminhos.vercel.app/auth/callback`. Valores salvos e conferidos na interface.
- A autorização normal da CLI da Vercel foi renovada com sucesso anteriormente. O botão permanecia desabilitado no link preenchido; abrir o formulário padrão `/oauth/device`, preencher o novo código e usar Allow Access resolveu pelo fluxo normal. CLI confirmou a conta `cortescora25-3226`. Na tentativa atual de teste, o navegador recusou acesso à aplicação por não conseguir verificar a política administrativa. Não foi alterada nem contornada a segurança do navegador.
- Migração `free_launch_quotas` aplicada remotamente e advisors sem alertas. A suíte SQL local completa encontrou a proteção de exclusão direta do Storage no ambiente hospedado; não foi contornada. Rollback confirmado sem fixtures. A suíte `supabase/tests/free_launch_remote.sql`, sem escritas no Storage, passou no banco hospedado: isolamento entre contas, permissões, reservas de imagens, limites, versões e referências inválidas. Consulta independente após rollback confirmou zero usuários, cadernos, imagens e objetos de teste. Upload e exclusão reais pelo Storage API continuam pendentes do teste HTTP autenticado.
- Produção anterior: `dpl_7v2jqu7NzkhtGdXVvszdoegWccM2`, READY; página `/privacidade` publicada e verificada no navegador nessa versão.
- `GOOGLE_AUTH_ENABLED=true` adicionada ao ambiente Production da Vercel. Publicação de ativação do Google `dpl_aM5xeW6tWTkDFSP6TxuPdLtzPE5o` concluída com saída 0 e estado READY, URL `https://alquimia-do-ser-caminhos-1yr80jjm9-din-dafc.vercel.app`. Alias de produção `https://alquimia-do-ser-caminhos.vercel.app` confirmado; build e TypeScript passaram. Os testes HTTP sem sessão documentados foram executados na versão anterior; não houve novo smoke nesta publicação.
- Login Google com conta real confirmado pelo proprietário, com captura do caderno autenticado. Primeiro salvamento, reabertura e isolamento entre duas sessões reais continuam pendentes de validação; testes SQL transacionais não substituem esse fluxo. A publicação da audiência Google para abertura pública ainda precisa ser confirmada.

- A pedido do proprietário, os exemplos pessoais foram retirados de todas as etapas, da ajuda, da política de privacidade e dos arquivos publicados. Publicação atual `dpl_6c9jmDJbwhcffPBAMWBaRmtjTUiy`, READY, alias canônico confirmado; TypeScript e build passaram. Cadernos e dados das contas não foram alterados. Uma cópia local das referências permanece fora da aplicação publicada.

## Verificação da ativação Google — 24/09/2026

- A consulta real a `/auth/v1/settings` confirmou `external.google=false`, `mailer_autoconfirm=false` e `disable_signup=false`: Google ainda desligado, confirmação de e-mail preservada, cadastro global do serviço habilitado.
- A conta `cortescora25@gmail.com` abriu autenticada no Google Auth Platform, sem projeto selecionado. A aba perdeu o controle antes de qualquer alteração; ao retomar, o navegador apresentou falha de sessão e tempo limite. Nenhum cliente OAuth foi criado nesta tentativa.
- As ferramentas conectadas do Supabase não expõem a alteração das configurações de Auth. A busca de integrações não encontrou uma ferramenta disponível de Google Cloud OAuth.
- Não foram alteradas credenciais, permissões, flags da aplicação ou configuração do provedor. O fluxo real com duas contas Google ainda não foi testado.
- Para retomar: selecionar/criar o projeto Google, configurar o cliente com os valores abaixo e salvar o Client ID/Secret diretamente no provedor Google do Supabase. Só depois habilitar a flag na Vercel e validar o login completo.

## Opção Google (não depende de SMTP)

1. Em https://console.cloud.google.com/auth/overview, criar ou selecionar um projeto para Alquimia do Ser.
2. Configurar a tela de consentimento para usuários externos. Usar apenas os escopos openid, e-mail e perfil. Se permanecer em modo de teste, incluir os colegas como usuários de teste; só liberar o aplicativo quando o fluxo estiver validado.
3. Criar credencial OAuth do tipo aplicação Web. Origem autorizada: `https://alquimia-do-ser-caminhos.vercel.app`.
4. Redirect URI do Google: `https://sbujezhugcthqkchsqcf.supabase.co/auth/v1/callback`.
5. No provedor Google do Supabase, inserir diretamente Client ID e Client Secret e ativar. Não compartilhar o segredo em mensagens nem adicioná-lo ao código.
   https://supabase.com/dashboard/project/sbujezhugcthqkchsqcf/auth/providers
6. Nas URLs do Supabase, Site URL: `https://alquimia-do-ser-caminhos.vercel.app`. Permitir o retorno exato: `https://alquimia-do-ser-caminhos.vercel.app/auth/callback`.
   https://supabase.com/dashboard/project/sbujezhugcthqkchsqcf/auth/url-configuration
7. Na Vercel, configurar `GOOGLE_AUTH_ENABLED=true` em produção e publicar novamente. Essa flag só deve ser ligada depois dos passos acima.
8. Testar com duas contas Google distintas: criar/abrir caderno, salvar, recarregar, anexar imagem, sair, entrar com a segunda conta. A segunda conta deve começar vazia e não acessar os registros/imagens da primeira.

## Alternativa e-mail e senha

Configurar SMTP no Supabase e confirmar entrega a usuários fora da equipe. Manter confirmação de e-mail habilitada. Adicionar também a URL de retorno `https://alquimia-do-ser-caminhos.vercel.app/auth/callback?next=/redefinir-senha`. Só então definir `EMAIL_AUTH_READY=true` na Vercel e publicar novamente. Validar confirmação e recuperação no navegador utilizado para iniciar o fluxo.

## Verificado até agora

- Publicação Next.js na Vercel concluída.
- Banco e bucket privado criados no Supabase.
- Teste transacional com duas contas confirmou isolamento dos cadernos, salvamento e detecção de versão desatualizada; fixtures revertidas.
- Verificação de segurança Supabase sem alertas na primeira checagem.
- Teste transacional de imagens confirmou que outra conta não lê metadados nem arquivos e não grava na pasta alheia; fixtures revertidas.
- Testes HTTP no domínio final passaram: redirecionamento ao login e APIs sem sessão bloqueadas. Consulta de logs de erro após publicação não retornou registros.
- Criação real de conta e Google OAuth não foram validados de ponta a ponta: provedor configurado e flag publicada, mas teste no navegador pendente. Recuperação por e-mail continua dependendo de SMTP.
- Dados do site anterior não foram migrados automaticamente.

Referência oficial: https://supabase.com/docs/guides/auth/social-login/auth-google
