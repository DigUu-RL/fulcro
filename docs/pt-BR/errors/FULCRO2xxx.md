# FULCRO2xxx — `@fulcro/functions`

🇺🇸 English: [Read this documentation in English](../../errors/FULCRO2xxx.md)

Os erros de [fluxo de controle como valores](../functions.md). Voltar para
[todos os códigos](../errors.md).

## FULCRO2001

```text
Error: FULCRO2001: Operation rejected with undefined
```

Detalhes:

```text
{ operation: string; thrown: null | undefined }
```

Não é lançado: é devolvido. A operação passada para `tryCatch()` lançou ou
rejeitou com `null` ou `undefined`, e o `tryCatch()` guardou este erro no lugar,
porque uma falha cujo `error` é `null` seria lida como sucesso. O que foi de
fato lançado fica em `cause`.

Não há nada a corrigir no `tryCatch()`. O código que lançou `null` ou
`undefined` é o que precisa ser olhado: lance um `Error` ali, e a falha vai
dizer o que deu errado.

## FULCRO2002

```text
TypeError: FULCRO2002: createEquals: expected an array of rules, received object.
```

Detalhes:

```text
{ operation: string; received: string }
```

O `createEquals()` recebeu algo que não é um array — quase sempre uma regra
sozinha, passada onde se esperava uma lista delas. `received` é o tipo do que
chegou.

Ponha a regra num array: `createEquals([byId])`, não `createEquals(byId)`.
`createEquals([])` é aceito, e cria uma variante que compara exatamente como o
`equals`.

## FULCRO2003

```text
TypeError: FULCRO2003: createEquals: rule 1 needs 'equals' to be a function, received undefined.
```

Detalhes:

```text
{ operation: string; index: number; member: string; received: string }
```

A regra na posição `index` da lista passada ao `createEquals()` não tem uma
função em `member`, que é `is` ou `equals`; `received` é o tipo do que foi
encontrado ali. Toda regra reconhece seus valores e também os compara, então as
duas são obrigatórias.

Dê à regra o membro que falta. Uma classe cujos valores se comparam por um
método de instância, como o `Decimal`, não é uma regra por si só — o `equals`
dela compara com um outro valor, não com dois —, então escreva a regra por
extenso: `{ is: Decimal.is, equals: (left, right) => left.equals(right) }`.
