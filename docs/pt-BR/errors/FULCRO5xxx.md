# FULCRO5xxx — `@fulcro/transform-core`

🇺🇸 English: [Read this documentation in English](../../errors/FULCRO5xxx.md)

Os erros da maquinaria por trás dos transformers de tempo de compilação do
`@fulcro/collections` e do `@fulcro/reflect`. Eles surgem enquanto o seu
projeto é compilado, e não enquanto ele roda. Voltar para
[todos os códigos](../errors.md).

## FULCRO5001

```text
Error: FULCRO5001: No tsconfig.json found from /app. The transformer needs one to know which files belong to the program.
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

O `tsconfig.json` foi encontrado mas não pôde ser lido — JSON inválido, ou um
`extends` apontando para um arquivo que não existe. A mensagem depois do código
é a do próprio TypeScript, e diz qual é o arquivo e qual é o problema.
