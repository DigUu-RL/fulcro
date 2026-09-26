# FULCRO2xxx — `@fulcro/functions`

🇺🇸 English: [Read this documentation in English](../../errors/FULCRO2xxx.md)

Os erros de [fluxo de controle como valores](../../functions.md). Voltar para
[todos os códigos](../errors.md).

## FULCRO2001

```text
Error: FULCRO2001: Operation rejected with undefined
```

Não é lançado: é devolvido. A operação passada para `tryCatch()` lançou ou
rejeitou com `null` ou `undefined`, e o `tryCatch()` guardou este erro no lugar,
porque uma falha cujo `error` é `null` seria lida como sucesso. O que foi de
fato lançado fica em `cause`.

Não há nada a corrigir no `tryCatch()`. O código que lançou `null` ou
`undefined` é o que precisa ser olhado: lance um `Error` ali, e a falha vai
dizer o que deu errado.
