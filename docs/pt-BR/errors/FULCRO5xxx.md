# FULCRO5xxx — `@fulcro/transform-core`

🇺🇸 English: [Read this documentation in English](../../errors/FULCRO5xxx.md)

Os erros da maquinaria por trás dos transformers de tempo de compilação do
`@fulcro/collections`, do `@fulcro/reflect` e do `@fulcro/memory`. Eles surgem
enquanto o seu projeto é compilado, e não enquanto ele roda. Voltar para
[todos os códigos](../errors.md).

## FULCRO5001

```text
Error: FULCRO5001: No tsconfig.json found from /app. The transformer needs one to know which files belong to the program.
```

Detalhes:

```text
{ operation: string; root: string }
```

Um plugin de bundler (`@fulcro/reflect/unplugin`,
`@fulcro/collections/unplugin`) não encontrou um `tsconfig.json`, procurando a
partir da raiz do projeto para cima. O transformer responde a partir de tipos,
e precisa da visão que o compilador tem do projeto para ter algum.

Adicione um `tsconfig.json` na raiz do projeto, ou aponte o plugin para o seu
com a opção `tsconfig`.

## FULCRO5002

```text
Error: FULCRO5002: <a mensagem do próprio compilador>
```

Detalhes:

```text
{ operation: string; diagnostic: string }
```

O `tsconfig.json` foi encontrado mas não pôde ser lido — JSON inválido, ou um
`extends` apontando para um arquivo que não existe. A mensagem depois do código
é a do próprio TypeScript, e diz qual é o arquivo e qual é o problema.

## FULCRO5003

```text
Error: FULCRO5003: The Fulcro transformer refused calls it could not answer at compile time:
src/tables.ts(4,23): FULCRO4010: constantOf(…) cannot be evaluated at compile time: 'counter' is declared with let or var, so it can change. …
```

Detalhes:

```text
{ operation: string; report: string }
```

Um transformer recusou uma ou mais chamadas de um arquivo — uma chamada que é
dele mas que ele não consegue responder, onde deixá-la para o runtime entregaria
uma resposta errada ou mais fraca. Cada linha diz o arquivo, a posição e a
recusa com o próprio código; consulte esse código para saber o que mudar.

No `tsc` com `ts-patch`, as recusas são erros de compilação próprios e este erro
não é lançado; ele é como um plugin de bundler, que não tem diagnósticos aos
quais somar, informa as mesmas recusas — todas as de um arquivo de uma vez.
