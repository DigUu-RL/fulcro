# FULCRO4xxx — `@fulcro/reflect`

🇺🇸 English: [Read this documentation in English](../../errors/FULCRO4xxx.md)

Os erros de [reflexão](../../reflect.md). Voltar para
[todos os códigos](../errors.md).

A maioria destes tem uma causa em comum: um utilitário que responde a partir de
um tipo chegou ao runtime sem que o transformer tivesse respondido antes. Um
tipo só existe em tempo de compilação, então em runtime não sobra nada para
ler, e o utilitário recusa em vez de adivinhar. A correção é a mesma para todos
— configurar o transformer, como [Reflexão](../../reflect.md) descreve — e cada
seção abaixo diz o que mais pode causá-lo.

## FULCRO4001

```text
Error: FULCRO4001: keysOf<T>() was not resolved at compile time. …
```

O transformer não respondeu `keysOf<T>()`. Além de um transformer que não
rodou, `T` pode não ter chaves para ler: um primitivo, uma união, ou um
parâmetro genérico que ainda não foi substituído.

## FULCRO4002

```text
Error: FULCRO4002: is<T>() was not resolved at compile time. …
```

O transformer não respondeu `is<T>()` ou `as<T>()` — a mensagem diz qual. Além
de um transformer que não rodou, `T` pode não ter nada que possa ser verificado
em runtime: uma index signature, ou um parâmetro genérico que ainda não foi
substituído.

Passe um teste seu como segundo argumento quando o tipo não puder ser lido.

## FULCRO4003

```text
Error: FULCRO4003: defaultOf<T>() resolves a type, which only exists at compile time. …
```

`defaultOf<T>()` chegou ao runtime. Ele não tem forma nenhuma em runtime: a
chamada é sempre substituída pelo valor que ela descreve, e só o transformer
consegue fazer isso.

## FULCRO4004

```text
Error: FULCRO4004: typeOf<T>() was not resolved at compile time. …
```

A forma de `typeOf` com argumento de tipo chegou ao runtime sem resposta. A
forma que recebe um valor, `typeOf(value)`, não precisa do transformer e
funciona como está.

## FULCRO4005

```text
Error: FULCRO4005: pathsOf<T>() was not resolved at compile time. …
```

O transformer não respondeu `pathsOf<T>()`. Além de um transformer que não
rodou, `T` pode não ter caminhos para percorrer: um primitivo, ou um parâmetro
genérico que ainda não foi substituído.

## FULCRO4006

```text
TypeError: FULCRO4006: as<Order>() refused a value of type string.
```

`as<T>()` recebeu um valor que não é um `T`, e não conseguiu dizer mais do que
o tipo do valor — o valor inteiro tem a forma errada.

Use `is<T>()` para ramificar a partir da resposta em vez de parar.

## FULCRO4007

```text
TypeError: FULCRO4007: as<Order>() refused a value: customer.email: expected string, got number
```

`as<T>()` recebeu um valor que não é um `T`, e a mensagem diz o primeiro lugar
onde ele difere.

## FULCRO4008

```text
Error: FULCRO4008: nameOf<T>() names a type, which only exists at compile time. …
```

A forma de `nameOf` com argumento de tipo chegou ao runtime. As formas que
recebem um valor ou um acessor, `nameOf(value)` e `nameOf(() => order.total)`,
não precisam do transformer.

## FULCRO4009

```text
Error: FULCRO4009: sizeOf<T>() reads the layout a type declares, which only exists at compile time. …
```

`sizeOf<T>()` ou `alignOf<T>()` chegou ao runtime sem resposta. Além de um
transformer que não rodou, `T` pode não ser um tipo concreto: um parâmetro
genérico não tem layout até ser substituído, e uma união de tipos com layouts
diferentes não tem um layout único.
