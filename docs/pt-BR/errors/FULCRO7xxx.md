# FULCRO7xxx — `@fulcro/memory`

🇺🇸 English: [Read this documentation in English](../../errors/FULCRO7xxx.md)

Os erros de [storage](../memory.md). Voltar para [todos os códigos](../errors.md).

## FULCRO7001

```text
RangeError: FULCRO7001: createManagedStorage: expected a length that is a non-negative safe integer, received -1.
```

Um storage foi pedido com um comprimento que ele não pode ter: negativo,
fracionário, `NaN` ou acima de `Number.MAX_SAFE_INTEGER`. O comprimento é
conferido antes de qualquer alocação.

Passe uma contagem. Quando o comprimento vem de uma conta — uma divisão, um
tamanho lido de um arquivo —, arredonde-o e confira-o antes de criar o storage.

## FULCRO7002

```text
RangeError: FULCRO7002: ManagedStorage.get: index 3 is outside a storage of length 3.
```

`get` ou `set` recebeu um índice que não é um inteiro de `0` a `length - 1`.
Nada foi lido nem escrito: um array teria respondido `undefined`, e um buffer
teria lido os bytes do vizinho, então o storage recusa.

A causa mais comum é um limite de laço uma posição além — `index <= length`
onde se queria `index < length` — ou um índice calculado como fração. Percorra
até `storage.length` e arredonde um índice calculado.

## FULCRO7003

```text
TypeError: FULCRO7003: createFixedBufferStorage: expected an element type with a name, layout.size, read, write and is; read is missing.
```

`createFixedBufferStorage` recebeu algo cujos valores ele não consegue guardar.
Ele precisa de um tipo que saiba o seu tamanho em bytes e se leia e se escreva
num offset, que é o que uma [struct](../types.md) é.

Um tipo numérico sozinho — `SinglePrecisionFloat`, `SignedInteger(32)` — é
recusado aqui: ele confere valores, mas não traz uma codificação em bytes
própria. Envolva-o numa struct de um campo:

```ts
const Sample = struct('Sample', { value: SinglePrecisionFloat });

createFixedBufferStorage(Sample, 1_000);
```

## FULCRO7004

```text
TypeError: FULCRO7004: FixedBufferStorage.set: the value is not a value of Point.
```

`set` recebeu um valor que a sua struct não reconhece como seu — um objeto
comum com os campos certos, um valor de uma struct com outros campos, ou um cujo
campo está fora da faixa do seu tipo. Nada foi escrito.

Crie o valor com a própria struct: `Point.from({ x, y })`. O compilador já
recusa isto quando a chamada é tipada; chega-se aqui por código sem tipos, ou
por um cast.
