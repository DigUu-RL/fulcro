---
name: fix-warnings
description: Varre o projeto inteiro atrás de warnings (build, typecheck, lint, formatação, testes, markdown, dependências, CI), explica a causa e a correção recomendada de cada um, e deixa o usuário escolher entre corrigir tudo ou não mexer em nada. Usar quando pedirem para listar, limpar, resolver ou entender os warnings do projeto.
---

# fix-warnings

Levantar **todos** os warnings do projeto, explicar cada um, e só então
perguntar se deve corrigir. Nunca corrigir antes de perguntar.

Um warning não é ruído: é um aviso que alguém escreveu porque o código está
dizendo uma coisa e fazendo outra. O valor desta skill está no diagnóstico —
o motivo — e não em fazer a mensagem sumir. Silenciar (`eslint-disable`,
`@ts-ignore`, `skip`) é sempre a última opção e sempre precisa de aprovação
explícita do usuário.

## 1. Coletar

Rodar da raiz do workspace, sempre com `2>&1` para capturar o stderr — é lá
que quase todo warning sai. Não parar no primeiro comando que falha: um erro
de build também esconde warnings dos passos seguintes, então registrar a
falha e seguir com o que der.

Ordem, neste repositório:

| # | Comando | O que revela |
| - | ------- | ------------ |
| 1 | `npm run build` | `tsc` (todas as flags do tsconfig), `tsc-alias`, avisos do transformer |
| 2 | `npm run typecheck` | os mesmos checks sem emit, mais `tsconfig.tests.json` |
| 3 | `npx vitest run --configLoader native` | warnings do runner, do Vite, dicas de config, `console.warn` das suítes, deprecações de API do Node |
| 4 | `npx eslint .` | as regras do `eslint.config.mjs`, incluindo a regra local `local/brace-wrapped-branches` |
| 5 | `npm run format:check` | arquivos fora do formato do Prettier |
| 6 | `npx --yes markdownlint-cli2 "**/*.md" "#node_modules" "#**/dist"` | o `.markdownlint.jsonc` existe mas não tem script; rodar mesmo assim |
| 7 | `npm ls --all` e a saída de `npm install` | `deprecated`, peer dependencies não satisfeitas, `EBADENGINE` |
| 8 | `gh run view <id> --log` da última run de CI | warnings que só aparecem em Linux ou em outra versão do Node |

Antes de rodar, conferir os `scripts` do `package.json` da raiz — se algum
comando acima tiver mudado de nome, usar o do arquivo, não o da tabela.

Warnings de CI (passo 8) valem a viagem: a matriz cobre Node 22/24 ×
Linux/Windows, e o repositório existe justamente porque o comportamento
difere entre plataformas.

## 2. Triar

Para cada warning encontrado, apurar antes de escrever qualquer coisa:

- **A mensagem literal** e o arquivo:linha.
- **Por que está aparecendo** — ler o código apontado. Não deduzir da
  mensagem. Muito warning aponta para o sintoma, e a causa está algumas
  linhas acima.
- **A correção recomendada**, concreta: o que muda, em qual arquivo.
- **Se é sensível.**

Um item é **sensível** quando qualquer uma destas for verdadeira:

- muda a superfície pública de um pacote (o que quebraria
  `tests/entrypoints.spec.mts`);
- a correção é silenciar, não resolver;
- exige subir versão de dependência, ou mexer em `package.json`/`tsconfig`/
  config de build;
- toca num trecho com comentário explicando a decisão atual — este
  repositório documenta o porquê no código, e um comentário longo acima da
  linha é um aviso de que alguém já pensou naquilo;
- contradiz uma decisão registrada na memória do projeto (por exemplo:
  `@fulcro/collections` não declara `sideEffects: false`; o `fsModuleCache`
  do vitest fica desligado de propósito, apesar da dica que ele imprime a
  cada execução — essa dica **não é** um warning a corrigir);
- existe mais de uma resolução legítima e a escolha é de gosto ou de
  arquitetura.

Agrupar warnings idênticos que se repetem em vários arquivos num item só,
com a contagem.

## 3. Relatar

Apresentar em tabela, do mais barato ao mais delicado:

```text
| # | Warning | Onde | Por que aparece | Correção recomendada | Sensível |
```

Abaixo da tabela, um parágrafo curto por item sensível explicando o dilema —
a tabela não cabe o raciocínio.

**Se não houver nenhum warning:** dizer isso, listando o que foi verificado,
e encerrar. Não perguntar nada, não commitar.

## 4. Perguntar

Com `AskUserQuestion`, exatamente duas opções:

1. **Corrigir automaticamente** — aplicar todas as correções, perguntando
   caso a caso nos pontos sensíveis.
2. **Deixar como está** — nada é alterado; o relatório fica como registro.

Se o usuário escolher deixar como está, encerrar sem tocar em arquivo nenhum
e sem commit.

## 5. Corrigir

Só depois do "sim". Na ordem da tabela, do trivial para o sensível.

- **Um assunto por vez**, e rodar de novo a verificação que produziu aquele
  warning antes de passar ao próximo. Correção que não elimina o warning não
  era a correção.
- **Todo item sensível vira uma pergunta** ao usuário, com as opções reais
  (incluindo "não mexer neste"), cada uma dizendo o que ganha e o que custa.
  O usuário pode responder outra coisa — se responder, seguir a resposta
  dele.
- `--fix` automático (`npx eslint . --fix`, `npm run format`) é permitido,
  mas **ler o diff depois**. O `--fix` do Prettier e do `simple-import-sort`
  é seguro; o de uma regra que reescreve lógica não é.
- Nunca silenciar sem aprovação explícita, e quando o usuário aprovar
  silenciar, escrever um comentário acima dizendo por quê.
- Se uma correção quebrar um teste, **parar** e voltar ao usuário com o que
  quebrou. Não ajustar o teste para acomodar a correção por conta própria.

No fim, rodar a bateria completa (passos 1 a 6 da coleta) e mostrar o
resultado: quantos warnings caíram, quais sobraram e por decisão de quem.

## 6. Commitar

Só se algum arquivo mudou.

Ler `git log -15 --format=%s%n%b` e escrever no estilo do repositório, que
hoje é: assunto no imperativo, em inglês, sem prefixo de conventional
commits, sem ponto final; corpo em prosa explicando **por que** — o que o
warning estava avisando de verdade e o que a correção passou a garantir. Um
parágrafo por assunto quando houver mais de um.

Anexar o trailer de atribuição vigente na sessão.

Não dar `git push` — o commit fica local para o usuário revisar. Mostrar o
`git log -1 --stat` do que foi commitado.
