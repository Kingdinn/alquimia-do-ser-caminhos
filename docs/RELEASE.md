# Publicação e operação

## Antes de convidar o grupo

- Abrir a entrada e a demonstração sem sessão.
- Entrar com duas contas independentes, salvar um texto fictício, recarregar e verificar que os registros permanecem separados.
- Testar upload, visualização, remoção e exportação. O JSON não inclui os arquivos das imagens.
- Confirmar a audiência do OAuth Google e os callbacks para o domínio final. Login e Calendar têm configurações distintas.
- Conferir privacidade, contato de suporte e instruções da demonstração.

## Antes de abrir o código

- Confirmar a licença MIT do código original, os créditos de terceiros e que o histórico público começa na versão com fundos visuais próprios.
- Confirmar conta/organização GitHub e revisar todos os arquivos e histórico do repositório.
- Excluir `.env*` reais, `.vercel`, caches, dependências, credenciais, dumps e dados pessoais.
- Executar testes, TypeScript e build. Ativar checks no repositório.

## Apoio

- Receber o Pix Copia e Cola ou link público escolhido pelo mantenedor.
- Verificar destinatário e ausência de valor fixo indesejado.
- Configurar as variáveis públicas descritas em SUPPORT.md e recompilar.
- Verificar o botão, cópia, destino e traduções, sem realizar pagamento.
- Após publicar uma página de apoio funcional, configurar `.github/FUNDING.yml` com seu URL real. Não adicionar links fictícios.

## Backup e exclusão

Definir quem é responsável e a frequência de backup. Confirmar o que o plano Supabase inclui: backup de banco não equivale a cópia dos objetos de Storage. Guardar cópias criptografadas fora do repositório; manter também a chave de criptografia do Calendar em local protegido. Testar restauração num projeto separado antes de tratar o processo como pronto.

A exportação do usuário é uma ajuda, não substitui backup operacional. Pedidos de exclusão chegam ao contato da política. Validar titularidade e tratar arquivos, caderno, integrações, conta e retenção de backups conforme o procedimento definido pelo mantenedor.

## Custos e alertas

Conferir os planos atuais e o uso real de Vercel/Supabase. Ativar alertas de consumo e falhas onde disponíveis; não contratar serviços pagos sem limite aprovado. As cotas por conta já limitam imagens e tamanho do caderno, mas não garantem capacidade ilimitada.

## Publicar

Confirmar equipe, projeto e fonte atual antes de substituir produção. O pacote local não prova ser idêntico ao último deployment. Fazer build de produção sem atribuir domínio, testar a versão pronta e então promovê-la. Registrar a versão anterior para rollback. Não executar migrações antigas novamente sem conferir o histórico remoto.

O repositório GitHub está conectado ao projeto Vercel. Commits na branch `main` geram uma nova publicação de produção; confirme os checks e revise a implantação antes de compartilhar mudanças relevantes.
