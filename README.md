# Alquimia do Ser · Caminhos

Um caderno pessoal para sonhar, visualizar, escolher prioridades, planejar e acompanhar pequenos passos. Interface em português, espanhol e inglês.

- [Usar a app](https://alquimia-do-ser-caminhos.vercel.app/)
- [Explorar a demonstração](https://alquimia-do-ser-caminhos.vercel.app/demonstracao) — o conteúdo se perde ao fechar ou recarregar.
- [Privacidade](https://alquimia-do-ser-caminhos.vercel.app/privacidade)

## Estado desta preparação

O código original do projeto usa a licença MIT, escolhida pelo mantenedor. As licenças de dependências e da música continuam próprias; veja `THIRD_PARTY_NOTICES.md`.

O acesso à app é gratuito. Contribuições financeiras são opcionais e não desbloqueiam funcionalidades. O botão de apoio só aparece quando um destino válido está configurado.

## Recursos

- Sete etapas: Sonhar, Visualizar, Ser, Envisionar, Planejar, Praticar e Acompanhar.
- Login Google, caderno por conta e salvamento automático com detecção de conflitos.
- Mural de imagens privado, metas e planejamento semanal/mensal.
- Exportação JSON dos textos e referências; as imagens não acompanham o arquivo.
- Integração opcional e unidirecional com Google Calendar, enquanto a app está aberta.
- Música opcional, controle de movimento e suporte a movimento reduzido.

## Executar localmente

Requisitos: Node.js 24 e npm. As dependências estão fixadas no `package-lock.json`.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Abra `http://localhost:3000/demonstracao`. Sem Supabase, apenas a demonstração funciona. Nenhuma credencial real está incluída no pacote.

Para habilitar contas na sua própria instalação:

1. Crie seu próprio projeto Supabase e configure sua URL e chave publicável em `.env.local`.
2. Aplique as migrações de `supabase/migrations/` em ordem, primeiro em um ambiente de teste. Não use o banco da instalação pública para desenvolver.
3. Configure a URL do site e os redirects de autenticação para sua instalação.
4. Para login Google, configure o provedor no Supabase e o callback fornecido por ele no Google Cloud. Ative `GOOGLE_AUTH_ENABLED` somente depois disso.
5. Para novos cadastros/recuperação por e-mail, configure e teste o serviço de e-mail antes de ativar `EMAIL_AUTH_READY`.
6. Para Calendar, siga `docs/GOOGLE_CALENDAR.md`; deixe-o desativado se não precisar dele.

A identidade visual, o contato de privacidade e o nome da instalação devem ser ajustados por quem hospedar uma cópia. Nunca reutilize as contas operacionais de outra instalação. Os scripts de configuração do Calendar presentes em `scripts/` são específicos da instalação original; revise seus alvos antes de usá-los.

## Verificar

```sh
npm test
npm run typecheck
npm run build
```

Teste HTTP contra uma instalação iniciada:

```sh
TEST_URL=http://localhost:3000 node tests/anonymous-smoke.mjs
```

Os testes unitários não substituem entrar com duas contas diferentes, salvar/reabrir, enviar/remover imagens e verificar a separação de dados no navegador. Os testes SQL remotos usam fixtures dentro de uma transação com rollback; leia-os antes de executar.

## Publicar sua instalação

Na Vercel, selecione Next.js, Node.js 24 e o diretório deste projeto. Configure as variáveis no ambiente correto e use a URL final em `NEXT_PUBLIC_SITE_URL`. Faça uma publicação de teste, valide os fluxos e depois promova para produção. Nunca publique `.env.local`, `.vercel`, credenciais OAuth, dumps do banco ou cadernos de usuários.

## Apoio voluntário

Veja `docs/SUPPORT.md`. Configure `NEXT_PUBLIC_SUPPORT_PIX_CODE` com o Pix Copia e Cola do próprio recebedor, ou `NEXT_PUBLIC_SUPPORT_URL` com seu link público aceito. Faça uma nova compilação para ativar. Não configure os exemplos dos testes como destino real.

## Contribuir e reportar problemas

Leia `CONTRIBUTING.md` e `SECURITY.md`. Não coloque conteúdo pessoal de cadernos em issues, capturas ou logs. O checklist operacional está em `docs/RELEASE.md`.
