# Segurança

Relate suspeitas de acesso indevido por e-mail para cortescora25@gmail.com. Não publique vulnerabilidades com dados pessoais em issues. Descreva a rota afetada e passos usando dados fictícios; não envie senhas, tokens, conteúdo de cadernos ou dados de outras pessoas.

O mantenedor ainda não oferece prazo contratual de resposta.

## Modelo de proteção

As APIs validam a sessão, e as operações do caderno verificam o proprietário. As tabelas e o armazenamento usam políticas por conta. Credenciais privilegiadas do Calendar ficam no servidor; nunca devem ser colocadas em variáveis `NEXT_PUBLIC_`.

A proteção por conta não é criptografia de ponta a ponta. Operadores com acesso administrativo à infraestrutura podem ter acesso aos dados. Rascunhos locais dependem da segurança do aparelho; a exportação JSON não contém os arquivos das imagens.

## Manutenção

- Revisar dependências e avisos de segurança antes de cada lançamento.
- Validar RLS e isolamento entre contas depois de migrações.
- Manter backups privados, separados do repositório, e testar restauração.
- Em caso de vazamento de segredo, revogá-lo/rotacioná-lo; remover só o arquivo não basta.
- Atender pedidos de exclusão pelo contato de privacidade, incluindo imagens e integrações. Não apagar uma conta sem validar a solicitação.
