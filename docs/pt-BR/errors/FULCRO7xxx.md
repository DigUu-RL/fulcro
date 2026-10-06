# FULCRO7xxx — `@fulcro/memory`

🇺🇸 English: [Read this documentation in English](../../errors/FULCRO7xxx.md)

Os erros de [storage, alocadores e views](../memory.md). Voltar para
[todos os códigos](../errors.md).

## FULCRO7001

```text
RangeError: FULCRO7001: createManagedStorage: expected a length that is a non-negative safe integer, received -1.
```

Detalhes:

```text
{ operation: string; received: number | string }
```

Um storage foi pedido com um comprimento que ele não pode ter: negativo,
fracionário, `NaN` ou acima de `Number.MAX_SAFE_INTEGER`. O comprimento é
conferido antes de qualquer alocação. `createPoolAllocator` reporta a sua
contagem de blocos do mesmo jeito, já que ela também é uma contagem.

Passe uma contagem. Quando o comprimento vem de uma conta — uma divisão, um
tamanho lido de um arquivo —, arredonde-o e confira-o antes de criar o storage.

## FULCRO7002

```text
RangeError: FULCRO7002: ManagedStorage.get: index 3 is outside a storage of length 3.
```

Detalhes:

```text
{ operation: string; index: number | string; length: number }
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

Detalhes:

```text
{ operation: string; missing: string }
```

`createFixedBufferStorage` ou `allocate` recebeu algo cujos valores não
consegue guardar. Ele precisa de um tipo que saiba o seu tamanho em bytes e se
leia e se escreva num offset, que é o que uma [struct](../types.md) é.

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

Detalhes:

```text
{ operation: string; element: string }
```

`set` recebeu um valor que a sua struct não reconhece como seu — um objeto
comum com os campos certos, um valor de uma struct com outros campos, ou um cujo
campo está fora da faixa do seu tipo. Nada foi escrito.

Crie o valor com a própria struct: `Point.from({ x, y })`. O compilador já
recusa isto quando a chamada é tipada; chega-se aqui por código sem tipos, ou
por um cast.

## FULCRO7005

```text
RangeError: FULCRO7005: ArenaAllocator.allocate: expected a size in bytes that is a non-negative safe integer, received -1.
```

Detalhes:

```text
{ operation: string; received: number | string }
```

Um alocador recebeu um número de bytes que não consegue reservar — negativo,
fracionário, `NaN` ou acima de `Number.MAX_SAFE_INTEGER` —, ou foi criado com
um tamanho de pedaço, uma capacidade ou um tamanho de bloco assim. Nada foi
reservado.

Passe uma contagem de bytes. Quando ela é calculada — `length × size` —,
confira os fatores: um comprimento já errado costuma ser a causa. `allocate`
confere o comprimento primeiro, então um storage de comprimento inválido falha
com [`FULCRO7001`](#fulcro7001) antes de chegar ao alocador.

## FULCRO7006

```text
RangeError: FULCRO7006: StackAllocator.allocate: expected an alignment that is a positive power of two, received 3.
```

Detalhes:

```text
{ operation: string; received: number | string }
```

Um alocador recebeu um alinhamento que não é `1`, `2`, `4`, `8` e assim por
diante. O alinhamento de todo layout é uma potência de dois, então qualquer
outro número não descreve posição nenhuma de que um tipo precise, e costuma ser
um tamanho passado no lugar do alinhamento: `arena.allocate(8, 24)` em vez de
`arena.allocate(24, 8)`.

`allocate` reporta do mesmo jeito um elemento cujo `layout.alignment` falta ou
é inválido, antes de pedir qualquer coisa ao alocador. Uma struct sempre traz
um.

## FULCRO7007

```text
RangeError: FULCRO7007: StackAllocator.allocate: 29 bytes aligned to 4 were requested, but only 29 of 32 bytes remain.
```

Detalhes:

```text
{
	operation: string;
	requested: number;
	alignment: number;
	available: number;
	capacity: number;
}
```

Uma pilha, um buffer fixo ou um pool não tem mais espaço para a requisição. Os
dois primeiros nunca crescem e um pool tem um número fixo de blocos, então o
alocador recusa em vez de passar do fim da sua memória. Nada foi reservado.

`available` é o que resta antes do alinhamento: uma requisição pode ser
recusada com tantos bytes livres quantos pediu, porque o seu início teve de
avançar até o próximo múltiplo de `alignment` — como no exemplo, em que o
primeiro byte livre está em `3` e a requisição tem de começar em `4`.

Libere algo antes — deixe um quadro, chame `reset()`, devolva um bloco com
`deallocate` — ou dê mais memória ao alocador. Quando a quantidade não é
conhecida de antemão, uma arena cresce e um alocador gerenciado sempre tem
espaço.

## FULCRO7008

```text
Error: FULCRO7008: StackAllocator.enter().allocate: frame 1 is not the innermost open frame, 2; frames are allocated from and left in last-in, first-out order.
```

Detalhes:

```text
{ operation: string; depth: number; innermost: number }
```

Um quadro da pilha — ou a própria pilha, que é o quadro `0` — foi usado
enquanto um quadro acima dele ainda está aberto. Alocar dele poria memória sua
dentro da memória que o quadro interno está para liberar, e deixá-lo liberaria
a memória do quadro interno por baixo dele. Nada mudou.

Deixe o quadro interno primeiro. Com `using`, os quadros são deixados na ordem
certa sozinhos; chega-se aqui chamando `[Symbol.dispose]()` à mão, ou
guardando um quadro externo e alocando dele dentro de um escopo interno.

## FULCRO7009

```text
Error: FULCRO7009: Storage.get: the memory was released by its allocator, and may already hold other values.
```

Detalhes:

```text
{ operation: string }
```

Um storage de `allocate` foi lido ou escrito depois que o seu alocador liberou
a sua memória — uma arena resetada, o quadro em que foi alocado deixado, o seu
bloco do pool devolvido. Os bytes continuam lá, e podem já pertencer a outra
alocação, então o storage recusa em vez de ler os valores de outro.

`PoolAllocator.deallocate` reporta a mesma coisa quando uma alocação é
devolvida pela segunda vez.

Mantenha o storage dentro do escopo em que a sua memória vive: aloque-o do
quadro ou da arena cujo tempo de vida combina com o dele, ou de um alocador
gerenciado quando ele tiver de sobreviver a eles.

## FULCRO7010

```text
RangeError: FULCRO7010: PoolAllocator.allocate: 49 bytes aligned to 8 do not fit a pool block of 48 bytes.
```

Detalhes:

```text
{ operation: string; requested: number; alignment: number; blockSize: number }
```

Um pool recebeu um pedido de mais bytes do que um bloco comporta, ou de um
alinhamento que os seus blocos não conseguem prometer. Todo bloco começa num
múltiplo de `blockSize`, então o alinhamento tem de dividir `blockSize`: blocos
de 48 bytes podem ser alinhados a 16, não a 32.

Crie o pool com blocos tão grandes quanto a maior requisição, arredondados para
um múltiplo do seu alinhamento — ou use outro alocador para as requisições que
não são do tamanho do pool.

## FULCRO7011

```text
Error: FULCRO7011: PoolAllocator.deallocate: the allocation was not made by this allocator.
```

Detalhes:

```text
{ operation: string }
```

`deallocate` recebeu uma alocação feita por outro alocador — outro pool, uma
arena, qualquer outro. Aceitá-la poria na lista de livres um bloco que não é do
pool. Nada mudou.

Devolva cada alocação ao pool que a fez.

## FULCRO7012

```text
Error: FULCRO7012: StackAllocator.enter().allocate: frame 1 was already left; enter a new one.
```

Detalhes:

```text
{ operation: string; depth: number }
```

Um quadro da pilha foi usado para alocar depois de deixado. A sua memória
voltou para a pilha quando ele foi deixado, então não há nada para ele
entregar.

Chame `stack.enter()` de novo para um quadro novo. Chega-se aqui guardando um
quadro além do fim do seu escopo `using` — devolvendo-o, ou armazenando-o.

## FULCRO7013

```text
TypeError: FULCRO7013: createFixedBufferAllocator: expected an ArrayBuffer, received SharedArrayBuffer.
```

Detalhes:

```text
{ operation: string; received: string }
```

`createFixedBufferAllocator` recebeu algo que não é um `ArrayBuffer`: um typed
array, um `SharedArrayBuffer`, um número. `received` diz o que era, nunca o seu
valor.

Passe o próprio buffer — `array.buffer` para um typed array, lembrando que ele
pode ser maior que o array — ou `new ArrayBuffer(size)`.

## FULCRO7014

```text
RangeError: FULCRO7014: asView: 3 values from position 8 do not fit in a source of 10.
```

Detalhes:

```text
{
	operation: string;
	start: number | string;
	length: number | string;
	available: number;
}
```

Uma view foi pedida para uma região que sai daquilo de onde é recortada: um
início antes de `0` ou depois do fim, um comprimento negativo, um comprimento
que passa do último valor, ou uma posição que não é um inteiro. `asView`,
`asReadOnlyView` e `subview` reportam do mesmo jeito. Para `subview`,
`available` é o comprimento da view, não da sua origem: uma subview fica
dentro da view de onde é recortada. Quando o comprimento foi omitido, `length`
é o resto da origem a partir de `start`.

Nada foi criado. Confira o início contra `source.length` antes de pedir. Para
observar tudo a partir de um início, omita o comprimento em vez de calculá-lo.

## FULCRO7015

```text
RangeError: FULCRO7015: View.get: position 2 is past the end of the array, which now holds 2 values; it shrank after it was viewed.
```

Detalhes:

```text
{ operation: string; index: number; length: number }
```

Uma view sobre um array foi lida ou escrita numa posição que o array não
alcança mais: o array encolheu — `pop`, `splice`, `length = …` — depois que a
view foi criada. `index` é a posição no array, e `length` o comprimento atual
dele. Um array teria respondido `undefined`, então a view recusa.

Crie a view de novo depois de mudar o comprimento do array, ou guarde os
valores num storage, cujo comprimento não muda.

## FULCRO7016

```text
RangeError: FULCRO7016: Pointer.offset: position 5 is outside 0 to 4, where a pointer into 4 values may point.
```

Detalhes:

```text
{ operation: string; index: number | string; length: number }
```

`pointerTo` ou `offset` foi pedido para uma posição que um ponteiro não pode
ter. Um ponteiro para `length` valores pode apontar para qualquer lugar de `0`
a `length`, inclusive a posição depois do último valor, para que um laço
chegue ao fim. Qualquer coisa antes de `0`, depois desse fim, ou que não seja
um inteiro é recusada, e nenhum ponteiro é criado.

Pare um laço em `cursor.index < source.length` em vez de passar dele. Ler ou
escrever no fim é outro erro, [`FULCRO7002`](#fulcro7002).

## FULCRO7017

```text
TypeError: FULCRO7017: asView: expected a storage, a view, an array, a pointer or a memory reference, received an object with get but no set.
```

Detalhes:

```text
{ operation: string; expected: string; received: string }
```

`asView`, `asReadOnlyView` ou `pointerTo` recebeu algo que não sabe alcançar.
`expected` lista o que aquela função aceita, e `received` descreve o que ela
recebeu, nunca o seu conteúdo. O caso mais comum é o mostrado: uma view
somente leitura entregue a `asView`, que a escreveria.

Passe uma origem somente leitura para `asReadOnlyView`. `pointerTo` recebe um
storage, uma view ou um array, não um ponteiro: mova um ponteiro com `offset`.
