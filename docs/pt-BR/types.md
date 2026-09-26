# Tipos numéricos

🇺🇸 English: [Read this documentation in English](../types.md)

Números com faixa e layout declarados: inteiros de largura fixa, três formatos
de ponto flutuante binário, um inteiro de qualquer tamanho e um decimal com a
semântica do decimal128 da IEEE 754 — e [structs](#structs), tipos de valor
construídos a partir deles.

```sh
npm install @fulcro/types
```

```ts
import {
	BigInteger,
	Decimal,
	DoublePrecisionFloat,
	HalfPrecisionFloat,
	SignedInteger,
	SinglePrecisionFloat,
	UnsignedInteger,
} from '@fulcro/types';
```

Os tipos e os descritores não precisam de mais nada — nenhum plugin de
compilador, nenhuma configuração. Toda operação é um método, tipado em qualquer
editor e em qualquer build; os operadores do JavaScript são os da linguagem,
como [Operadores](#operadores) explica.

## O problema

JavaScript tem um único número, um float binário de 64 bits, e ele é o número
errado para a maioria dos valores que um programa guarda:

```ts
0.1 + 0.2; // 0.30000000000000004 — um preço que deu errado
2 ** 53 + 1; // 9007199254740992 — um identificador alterado em silêncio
const port = 70_000; // nada diz que uma porta tem 16 bits
```

O primeiro é uma fração decimal guardada em binário. O segundo é um inteiro
além dos 53 bits que um double guarda com exatidão. O terceiro é uma faixa que
ninguém escreveu, então nada a verifica. Este pacote dá a cada um desses números
o nome do que ele é, e o verifica onde ele é criado.

## Todo tipo tem um valor com o mesmo nome

Um tipo é apagado a caminho do JavaScript, então `SignedInteger<32>` sozinho não
verifica nada. Cada tipo vem, por isso, com um **descritor** de mesmo nome, que
converte, reconhece e calcula:

```ts
const Int32 = SignedInteger(32);

const port: UnsignedInteger<16> = UnsignedInteger(16).from(8080);
const total: SignedInteger<32> = Int32.add(Int32.from(1), Int32.from(2));
```

Os descritores têm tipos próprios, para código que funciona com qualquer tipo
numérico: o descritor de um inteiro é um `IntegerType<T>`, o de um float um
`BoundedNumericType<T, number>`, e o do `BigInteger` um `NumericType<T, TSource>`
— sendo `TSource` o que o `from` aceita. `IntegerWidth` é a união das
larguras, `8 | 16 | 32 | 64 | 128`.

```ts
import type { NumericType } from '@fulcro/types';

const sum = <T>(
	type: NumericType<T, unknown>,
	values: readonly T[],
	zero: T,
): T => values.reduce((total, value) => type.add(total, value), zero);
```

Todo tipo com faixa a informa como `minimum` e `maximum`: o menor e o maior
valor **finito**. `minimum` é o valor mais negativo, e não o menor positivo, que
é o que `Number.MIN_VALUE` significa:

| Tipo                             | `minimum`           | `maximum`          |
| -------------------------------- | ------------------- | ------------------ |
| `SignedInteger<N>`               | −2^(N−1)            | 2^(N−1) − 1        |
| `UnsignedInteger<N>`             | 0                   | 2^N − 1            |
| `HalfPrecisionFloat`             | −65.504             | 65.504             |
| `SinglePrecisionFloat`           | ≈ −3,4 × 10³⁸       | ≈ 3,4 × 10³⁸       |
| `DoublePrecisionFloat`           | −`Number.MAX_VALUE` | `Number.MAX_VALUE` |
| `Decimal` (`Decimal.minimum`, …) | −9,99…9 × 10⁶¹⁴⁴    | 9,99…9 × 10⁶¹⁴⁴    |

O `BigInteger` não tem nenhum dos dois: seus valores são tão grandes quanto a
memória permitir.

Se você quer só os tipos — para anotar uma interface, por exemplo — importe com
`import type` e nenhum código é carregado:

```ts
import type { SignedInteger } from '@fulcro/types';

interface Packet {
	readonly length: SignedInteger<32>;
}
```

## Inteiros de largura fixa

`SignedInteger<N>` e `UnsignedInteger<N>`, com `N` de 8, 16, 32, 64 ou 128
bits. A largura é um parâmetro, não parte do nome: não existe
`SignedInteger32`, nem `i32`.

| Largura | Faixa com sinal  | Faixa sem sinal | Carregado por |
| ------- | ---------------- | --------------- | ------------- |
| 8       | −128 … 127       | 0 … 255         | `number`      |
| 16      | −32.768 … 32.767 | 0 … 65.535      | `number`      |
| 32      | −2³¹ … 2³¹ − 1   | 0 … 2³² − 1     | `number`      |
| 64      | −2⁶³ … 2⁶³ − 1   | 0 … 2⁶⁴ − 1     | `bigint`      |
| 128     | −2¹²⁷ … 2¹²⁷ − 1 | 0 … 2¹²⁸ − 1    | `bigint`      |

Até 32 bits um `number` guarda todo valor com exatidão e não custa nada. A
partir de 64 ele não consegue, então o valor é um `bigint` — e o tipo diz isso,
em vez de você descobrir por um dígito perdido.

### Verificado, a menos que você peça para dar a volta

Toda operação verifica o resultado, e um resultado fora da faixa lança erro:

```ts
const Byte = UnsignedInteger(8);

Byte.from(256); // RangeError: FULCRO6031: UnsignedInteger<8>.from: 256 is outside [0, 255].
Byte.subtract(Byte.from(0), Byte.from(1)); // RangeError
Byte.from(1.5); // RangeError: FULCRO6002: UnsignedInteger<8>.from: expected an integer, received 1.5.
```

Quando aritmética modular é o que você quer — hash, checksum, emular um
registrador — diga isso com `wrap`, que reduz qualquer inteiro módulo 2^N e
nunca lança erro:

```ts
SignedInteger(8).wrap(200); // -56
UnsignedInteger(8).wrap(-1); // 255
SignedInteger(32).wrap(2 ** 31); // -2147483648
```

Cada descritor tem `from`, `wrap`, `is`, `minimum`, `maximum`, `width` e
`signed`, a aritmética `add`, `subtract`, `multiply`, `divide`, `remainder`,
`power`, `negate`, `increment` e `decrement`, as comparações `equals`,
`lessThan`, `lessThanOrEqual`, `greaterThan` e `greaterThanOrEqual`, e as
operações de bits `bitwiseAnd`, `bitwiseOr`, `bitwiseXor`, `bitwiseNot`,
`shiftLeft`, `shiftRight` e `shiftRightLogical`.

- A divisão trunca em direção a zero; o resto leva o sinal do dividendo, como
  `%`. Dividir por zero, e dividir o mínimo de um tipo com sinal por −1, lança
  erro.
- `power` recebe um expoente do mesmo tipo; um negativo lança erro, assim como
  um resultado fora da faixa.
- A contagem de um shift precisa ir de 0 à largura − 1, senão lança erro. Os
  bits que saem são descartados — um shift é uma operação de bits, nunca um
  overflow. `>>` copia o bit de sinal num tipo com sinal; `shiftRightLogical`
  (`>>>`) traz zeros, sobre a largura do próprio tipo: `-1 >>> 28` é `15` em
  32 bits.

Um `SignedInteger<8>` não é um `SignedInteger<32>`, mesmo que todo valor de um
caiba no outro: alargar passa por `from`, onde fica visível.

## Floats

| Tipo                   | Formato           | Bits significativos | Finito até    |
| ---------------------- | ----------------- | ------------------- | ------------- |
| `HalfPrecisionFloat`   | IEEE 754 binary16 | 11                  | 65.504        |
| `SinglePrecisionFloat` | IEEE 754 binary32 | 24                  | ≈ 3,4 × 10³⁸  |
| `DoublePrecisionFloat` | IEEE 754 binary64 | 53                  | ≈ 1,8 × 10³⁰⁸ |

Cada um é carregado por um `number` que guarda um valor que o formato
representa com exatidão, então ele é lido, comparado e impresso como qualquer
número. `from` arredonda para o valor mais próximo, empates para o par:

```ts
SinglePrecisionFloat.from(0.1); // 0.10000000149011612
HalfPrecisionFloat.from(0.1); // 0.0999755859375
HalfPrecisionFloat.from(65520); // Infinity
```

A aritmética arredonda cada resultado uma vez, de volta ao formato. Isso não é
uma aproximação: quando o formato mais largo tem pelo menos 2p + 2 bits de
precisão, calcular em double e arredondar uma vez dá exatamente o resultado
corretamente arredondado, e um double tem o suficiente para os dois formatos
menores.

```ts
const a = SinglePrecisionFloat.from(0.1);
const b = SinglePrecisionFloat.from(0.2);

SinglePrecisionFloat.add(a, b); // 0.30000001192092896, como o hardware float32 dá
```

Escrito com o operador, `a + b` é um double que ninguém arredondou:
`0.30000000447034836`.

`power` é o `Math.pow` arredondado uma vez para o formato. Ao contrário das
quatro operações acima, ele é fiel, mas não garantidamente o mais próximo,
porque o próprio `Math.pow` não é corretamente arredondado.

`from` aceita só `number`. Um `bigint` é recusado em vez de convertido, porque
transformá-lo primeiro em double e depois no formato arredonda duas vezes, e o
segundo arredondamento pode cair no vizinho errado.

## `BigInteger`

Um inteiro de qualquer tamanho, carregado por um `bigint` — que já é exato em
qualquer magnitude — e com brand como todos os outros tipos daqui: um
`BigInteger` é um `bigint` que passou por `BigInteger.from`, e um `bigint` não
verificado não pode ser passado onde se espera um.

O descritor acrescenta um `from` que só aceita decimal — `BigInteger.from('0x10')`
é recusado, não lido como 16 —, uma divisão que diz qual operação dividiu por
zero, e um `power` que recusa expoente negativo.

É o único tipo aqui sem layout fixo: o tamanho dele é o tamanho do valor.

## `Decimal`

Um número decimal de ponto flutuante, para dinheiro e para tudo o que é decimal
por natureza:

```ts
const price = Decimal.from('19.99');

price.multiply(Decimal.from(3)).toString(); // '59.97'
Decimal.from('0.1').add(Decimal.from('0.2')).equals(Decimal.from('0.3')); // true
```

A semântica é a do **decimal128** da IEEE 754, como a proposta TC39 Decimal a
especifica: 34 dígitos significativos, expoentes de −6143 a 6144, e os valores
especiais `NaN`, `Infinity`, `-Infinity` e `-0`. Código escrito contra ela lê
igual contra um decimal nativo, se a plataforma um dia tiver um.

### Criando um

```ts
Decimal.from('-12.50'); // de um literal; zeros à direita não são guardados
Decimal.from(0.1); // de um number: exatamente 0.1, não o valor binário perto dele
Decimal.from(12345678901234567890n); // de um bigint, exatamente
```

Uma string é um literal decimal: sinal opcional, dígitos com no máximo um ponto,
expoente opcional, ou `NaN` / `Infinity`. Espaços ao redor e hexadecimal são
recusados com `SyntaxError`. Além de 34 dígitos significativos o valor é
arredondado half to even.

### Toda operação arredonda uma vez

`add`, `subtract`, `multiply` e `divide` calculam o resultado exato e o
arredondam para 34 dígitos, half to even a menos que você passe um modo:

```ts
Decimal.from(1).divide(Decimal.from(3)).toString();
// '0.3333333333333333333333333333333333'

Decimal.from(2).divide(Decimal.from(3), 'truncate').toString();
// '0.6666666666666666666666666666666666'
```

`remainder` é sempre exato e leva o sinal do dividendo. `power(exponent, mode)`
recebe um expoente inteiro de qualquer sinal e é corretamente arredondado sempre
que a potência exata tem até 200.000 dígitos — o que cobre toda base que não
esteja a um fio de um; além disso, usa 50 dígitos de guarda. Um expoente com
fração lança erro. Qualquer coisa elevada a zero é um, `NaN` incluído, como no
`pown` da IEEE 754:

```ts
Decimal.from('1.1').power(Decimal.from(2)).toString(); // '1.21'
Decimal.from(2).power(Decimal.from(-2)).toString(); // '0.25'
```

`round(places, mode)` arredonda para um número de casas depois do ponto —
negativo para dezenas, centenas e assim por diante:

```ts
Decimal.from('2.345').round(2).toString(); // '2.34'
Decimal.from('2.345').round(2, 'halfAwayFromZero').toString(); // '2.35'
Decimal.from('1250').round(-2).toString(); // '1200'
```

### Modos de arredondamento

| Modo                 | Resolve um valor entre dois vizinhos para       |
| -------------------- | ----------------------------------------------- |
| `'halfEven'`         | o mais próximo; um empate para o par — o padrão |
| `'halfAwayFromZero'` | o mais próximo; um empate para o mais afastado  |
| `'truncate'`         | o que está em direção a zero                    |
| `'floor'`            | o que está em direção a −∞                      |
| `'ceiling'`          | o que está em direção a +∞                      |

Half to even é o padrão porque não deriva: arredondar todo empate para o mesmo
lado enviesa uma soma, e alterná-los pela paridade não. Os cinco são exportados
como o tipo `RoundingMode`, e um modo que não seja um deles lança `RangeError`
em vez de cair num padrão.

### Os operadores são recusados

```ts
const one = Decimal.from(1);

one + one; // erro de compilação: Operator '+' cannot be applied to types 'Decimal' and 'Decimal'.
`${one}`; // '1' — template literal funciona
```

Uma conversão implícita para `number` perderia exatamente os dígitos que o tipo
existe para guardar, então ela é recusada duas vezes: o TypeScript rejeita o
operador em tempo de compilação, e onde os tipos são contornados — JavaScript
sem tipos, um `any` — a conversão lança `TypeError` em runtime. Escreva
`one.add(one)`.

### Valores especiais

A divisão por zero segue a IEEE 754 em vez de lançar erro: um valor diferente
de zero dividido por zero é um infinito, e zero dividido por zero é `NaN`. Um
resultado grande demais para o formato vira um infinito, ou — num modo
direcionado — para no maior valor finito. `NaN` não é ordenado em relação a
nada: `compare` devolve `undefined`, e todo método de comparação devolve
`false`. `0` e `-0` são iguais; `isNegative()` os distingue.

### Tirando o valor

| Método                                  | Devolve                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `toString()`                            | o texto mais curto; exponencial fora de 10⁻⁶ … 10²¹, como `Number` |
| `toFixed(fractionDigits?, mode?)`       | um número fixo de casas, em notação comum                          |
| `toPrecision(precision, mode?)`         | um número de dígitos significativos                                |
| `toExponential(fractionDigits?, mode?)` | notação exponencial                                                |
| `toLocaleString(locales?, options?)`    | `Intl.NumberFormat` sobre o texto decimal, sem perder dígito       |
| `toJSON()`                              | o texto, para `JSON.stringify` escrever uma string e não `{}`      |
| `toNumber()`                            | o `number` mais próximo                                            |
| `toBigInt()`                            | o inteiro exato; lança erro se houver fração                       |

## Operadores

Os operadores do JavaScript são os da linguagem, e nenhum tipo daqui muda isso:
o TypeScript não tem sobrecarga de operadores, então `a + b` só pode significar
o que significa para o primitivo por baixo. Nos tipos carregados por `number`
ou `bigint` ele faz conta comum, sem verificação — `a + a` em dois
`SignedInteger<32>` é `4000000000`, um `number` — e nada em runtime consegue
recusar. Num `Decimal` ele é erro de tipo, e `TypeError` em runtime.

Todo operador tem um método que mantém o tipo e as verificações, no descritor
para os tipos carregados por primitivos e no valor para um `Decimal`:

```ts
const Int32 = SignedInteger(32);
const a = Int32.from(2_000_000_000);

Int32.subtract(a, Int32.from(1)); // SignedInteger<32>
Int32.add(a, a); // RangeError: FULCRO6031: SignedInteger<32>.add: 4000000000 is outside [-2147483648, 2147483647].

Decimal.from('19.99').multiply(Decimal.from(3)); // Decimal: 59.97
Decimal.from('0.1').add(Decimal.from('0.2')).equals(Decimal.from('0.3')); // true
```

| Em vez de                  | Escreva                                               | Em                                 |
| -------------------------- | ----------------------------------------------------- | ---------------------------------- |
| `+ - * / % **`, `-` unário | `add`, `subtract`, `multiply`, … `power`, `negate`    | todo tipo                          |
| `++ --`                    | `increment`, `decrement` (`add` de um, num `Decimal`) | todo tipo                          |
| `< <= > >=`                | `lessThan`, `lessThanOrEqual`, …                      | todo tipo                          |
| `=== !==`                  | `equals`, por valor                                   | todo tipo                          |
| `& \| ^ ~ << >> >>>`       | `bitwiseAnd`, … `shiftRightLogical`                   | `SignedInteger`, `UnsignedInteger` |

Num `Decimal`, `===` compara os dois objetos, não os valores: compare com
`equals`.

## Layout

Todo tipo, exceto `BigInteger`, declara seu tamanho e alinhamento em bytes, para
o modelo de memória sobre o qual as próximas features são construídas. O
`@fulcro/reflect` os lê em tempo de compilação:

```ts
import { alignOf, sizeOf } from '@fulcro/reflect';
import type { Decimal, SignedInteger } from '@fulcro/types';

sizeOf<SignedInteger<32>>(); // 4
alignOf<Decimal>(); // 16
```

| Tipo                                | Tamanho, alinhamento |
| ----------------------------------- | -------------------- |
| inteiros de 8, 16, 32, 64, 128 bits | 1, 2, 4, 8, 16       |
| `HalfPrecisionFloat`                | 2                    |
| `SinglePrecisionFloat`              | 4                    |
| `DoublePrecisionFloat`              | 8                    |
| `Decimal`                           | 16                   |

O layout mora no tipo e nunca num valor: um import só de tipo basta para o
`sizeOf`, e nada deste pacote é carregado para respondê-lo. Veja
[Reflection](../reflect.md#sizeoft-and-alignoft) para como os dois se
encontram.

## Structs

Um struct é um **tipo de valor** com layout fixo, construído a partir dos tipos
acima e de outros structs. Como os tipos numéricos, ele tem um valor e um tipo
com o mesmo nome:

```ts
import { SinglePrecisionFloat, struct, type Struct } from '@fulcro/types';

export const Vector3 = struct('Vector3', {
	x: SinglePrecisionFloat,
	y: SinglePrecisionFloat,
	z: SinglePrecisionFloat,
});
export type Vector3 = Struct<typeof Vector3>;

const up: Vector3 = Vector3.from({ x: 0, y: 1, z: 0 });
```

O `from` converte cada campo com o `from` do próprio tipo, então `0.1` vira o
valor de precisão simples mais próximo e `256` num campo de 8 bits é um
`RangeError` que nomeia o campo. Um campo declarado com `BigInteger`, que não
tem tamanho fixo, não compila.

O tipo do próprio descritor é `StructType<TFields>`, para código que funciona
com qualquer struct, como o `NumericType` é para os tipos numéricos.

### Valores, identidades e referências

| Tipo                   | O que é                                                | Aqui                                   |
| ---------------------- | ------------------------------------------------------ | -------------------------------------- |
| **Tipo de valor**      | Definido pelo conteúdo; sem identidade; layout fixo    | os tipos numéricos e todo `struct`     |
| **Tipo de identidade** | Definido por qual objeto é, independente do que contém | objetos e classes comuns               |
| **Tipo de referência** | Aponta para um valor guardado em outro lugar           | `Pointer<T>` e `View<T>`, mais adiante |

Por isso um valor de struct é congelado, e dois deles são comparados pelos
campos — `Vector3.equals(a, b)` — nunca por `===`, que continua comparando os
dois objetos. Cada campo compara como o próprio tipo compara: um campo `NaN`
torna um valor diferente de si mesmo.

### Métodos

Um terceiro argumento dá a todo valor do struct os seus métodos, com `this`
sendo o valor:

```ts
export const Vector3 = struct(
	'Vector3',
	{ x: SinglePrecisionFloat, y: SinglePrecisionFloat, z: SinglePrecisionFloat },
	{
		length() {
			return Math.hypot(this.x, this.y, this.z);
		},
		scale(factor: number) {
			return Vector3.from({
				x: this.x * factor,
				y: this.y * factor,
				z: this.z * factor,
			});
		},
	},
);
export type Vector3 = Struct<typeof Vector3>; // inclui length() e scale()

Vector3.from({ x: 3, y: 4, z: 0 }).length(); // 5
```

Os métodos ficam num único protótipo compartilhado por todos os valores, e não
em cada valor. Eles não ocupam bytes e não são campos: o layout, o `equals` e os
bytes são os que os campos sozinhos produzem, e um valor lido de bytes tem os
seus métodos como um criado pelo `from`. Escreva-os como métodos, não como arrow
functions, para que `this` seja o valor.

Um valor continua congelado, então um método não o altera: ele devolve um valor
novo, como o `scale` faz. Um método com o nome de um campo, de um índice de
array ou `~layout`, ou que não seja uma função, é um `TypeError` na declaração
do struct.

Num struct com métodos, o `is` também confere que o valor foi criado pelo
struct: um objeto só com os campos certos não carrega os métodos, então não é
um valor dele. Um struct sem métodos continua reconhecendo esse objeto, como
sempre.

Um valor que atravessa a fronteira de um worker ou passa por JSON perde os
métodos: o structured clone por trás do `postMessage` não preserva protótipos,
então o que chega são só os campos. Recrie-o com `Vector3.from(value)` do outro
lado.

### Onde os campos ficam

Os campos são posicionados por alinhamento, do maior para o menor, e na ordem
de declaração entre iguais. Todo tamanho é múltiplo do próprio alinhamento,
então nenhum campo precisa de padding antes dele; só o fim do struct recebe
padding, até o alinhamento dele, para que o próximo num array comece alinhado.

```ts
const Sample = struct('Sample', {
	flag: UnsignedInteger(8), // offset 10
	weight: DoublePrecisionFloat, // offset 0
	count: UnsignedInteger(16), // offset 8
});

Sample.layout.size; // 16: onze bytes, com padding até o alinhamento 8
sizeOf<Struct<typeof Sample>>(); // 16, em tempo de compilação
```

Os campos não ficam na ordem de declaração com padding entre eles. Esta ordem é
a que torna o tamanho calculável pelo type checker — o que permite ao `sizeOf`
responder em tempo de compilação — e que não desperdiça nenhum byte dentro do
struct.

O `layout` dá o offset, o tamanho e o alinhamento de cada campo em runtime. Um
struct aninhado como campo fica inline, como um campo com o próprio tamanho.

### Bytes

Um valor pode ser escrito num `DataView` e lido de volta, que é como um struct
é guardado sem um objeto por valor — um buffer de mil vetores ocupa doze mil
bytes:

```ts
const buffer = new ArrayBuffer(Vector3.layout.size * 1000);
const view = new DataView(buffer);

Vector3.write(view, Vector3.layout.size * 7, up);
Vector3.read(view, Vector3.layout.size * 7); // { x: 0, y: 1, z: 0 }
```

Todo valor é little-endian, em qualquer plataforma. Inteiros são complemento de
dois, os floats são binary16, binary32 e binary64 da IEEE 754, e o `Decimal` é
decimal128 da IEEE 754 na codificação de inteiro binário. Bytes de padding
ficam como estavam. Um offset em que o struct não cabe é um `RangeError`,
lançado antes de qualquer byte ser escrito.

O `read` cria um objeto novo a cada chamada: guardar um valor não custa um
objeto, segurar um ainda custa.
