# Testes das cotas

Execute depois das duas migrações, com o papel `postgres`, mantendo cada arquivo inteiro na mesma conexão. Os scripts começam com `BEGIN` e terminam com `ROLLBACK`: usuários fictícios, cadernos, reservas e funções temporárias não persistem. Se a execução for interrompida por erro, faça `ROLLBACK` nessa conexão antes de continuar.

## Supabase remoto

Use **`free_launch_remote.sql`** pelo editor SQL ou por uma conexão PostgreSQL administrativa:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/free_launch_remote.sql
```

Valida 12 reservas e rejeição da 13ª, ausência de escrita direta nos metadados, isolamento entre duas contas, exigência de autenticação nas funções, limite de 600 KiB, estrutura das referências, conflitos de versão, estado `deleting` e liberação de reservas sem arquivo. Consulta a configuração do bucket e testa o predicado de autorização de upload.

Este arquivo **não escreve no Storage**, não desativa proteções e não muda privilégios do Storage. Os papéis e claims simulam requisições autenticadas ao banco; não comprovam login real nem requisições HTTP ao Storage.

## PostgreSQL local descartável

**`free_launch_quotas.sql`** é exclusivo de um PostgreSQL descartável com schemas Auth/Storage simulados. Ele cria metadados fictícios de objetos para exercitar as políticas e referências positivas, sem arquivos reais. Não execute esse arquivo no Supabase gerenciado, mesmo dentro de `ROLLBACK`: o serviço impede corretamente exclusões diretas das suas tabelas. Não contorne essa proteção.

## Validação autenticada ainda necessária

Pela aplicação e pelas APIs suportadas, validar upload e finalização reais, rejeição de arquivo acima de 1 MiB, imagem pronta em caderno salvo, rejeição de exclusão enquanto referenciada, remoção após salvar sem referência, repetição de exclusão interrompida e isolamento com duas contas. A concorrência entre conexões também exige teste próprio; os scripts transacionais são sequenciais.
