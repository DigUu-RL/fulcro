# Tipos numéricos

🇺🇸 English: [Read this documentation in English](../types.md)

Números com faixa e layout declarados: inteiros de largura fixa, três formatos
de ponto flutuante binário, um inteiro de qualquer tamanho e um decimal com a
semântica do decimal128 da IEEE 754.

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

Sem dependências e sem plugin de compilador.

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
numérico: o descritor de um inteiro é um `IntegerType<T>`, e todos os outros um
`NumericType<T, TSource>` — sendo `TSource` o que o `from` aceita — e
`IntegerWidth` é a união das larguras, `8 | 16 | 32 | 64 | 128`.

```ts
import type { NumericType } from '@fulcro/types';

const sum = <T>(
	type: NumericType<T, unknown>,
	values: readonly T[],
	zero: T,
): T => values.reduce((total, value) => type.add(total, value), zero);
```

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

Toda operação verifica o resultado, como um contexto `checked` do C#:

```ts
const Byte = UnsignedInteger(8);

Byte.from(256); // RangeError: UnsignedInteger<8>.from: 256 is outside [0, 255].
Byte.subtract(Byte.from(0), Byte.from(1)); // RangeError
Byte.from(1.5); // RangeError: expected an integer, received 1.5.
```

Quando aritmética modular é o que você quer — hash, checksum, emular um
registrador — diga isso com `wrap`, que reduz qualquer inteiro módulo 2^N e
nunca lança erro:

```ts
SignedInteger(8).wrap(200); // -56
UnsignedInteger(8).wrap(-1); // 255
SignedInteger(32).wrap(2 ** 31); // -2147483648
```

Cada descritor tem `from`, `wrap`, `is`, `add`, `subtract`, `multiply`,
`divide`, `remainder`, e `minimum`, `maximum`, `width` e `signed`. A divisão
trunca em direção a zero; o resto leva o sinal do dividendo, como `%`. Dividir
por zero, e dividir o mínimo de um tipo com sinal por −1, lança erro.

### Por que os operadores não bastam

Um inteiro com brand continua sendo um `number` ou um `bigint`, então os
operadores funcionam nele — e o resultado volta a ser um `number` comum, sem
verificação:

```ts
const a = Int32.from(2_000_000_000);

a + a; // 4000000000: um number, que já não é um inteiro de 32 bits
Int32.add(a, a); // RangeError — que é o objetivo
```

Use a aritmética do descritor onde a faixa importa. Um `SignedInteger<8>`
também não é um `SignedInteger<32>`, mesmo que todo valor de um caiba no outro:
alargar passa por `from`, onde fica visível.

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
a + b; // 0.30000000447034836, um double que ninguém arredondou
```

`from` aceita só `number`. Um `bigint` é recusado em vez de convertido, porque
transformá-lo primeiro em double e depois no formato arredonda duas vezes, e o
segundo arredondamento pode cair no vizinho errado.

## `BigInteger`

Um inteiro de qualquer tamanho. É o `bigint` com o nome do conceito, já que o
`bigint` é exato em qualquer magnitude. O descritor acrescenta um `from` que só
aceita decimal — `BigInteger.from('0x10')` é recusado, não lido como 16 — e uma
divisão que diz qual operação dividiu por zero.

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

`remainder` é sempre exato e leva o sinal do dividendo. `round(places, mode)`
arredonda para um número de casas depois do ponto — negativo para dezenas,
centenas e assim por diante:

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

### Operadores são recusados

```ts
const one = Decimal.from(1);

one + one; // erro de compilação: Operator '+' cannot be applied to types 'Decimal' and 'Decimal'.
`${one}`; // '1' — template literal funciona
```

Uma conversão implícita para `number` perderia exatamente os dígitos que o tipo
existe para guardar, então ela é recusada duas vezes: o TypeScript rejeita o
operador em tempo de compilação, e onde os tipos são contornados — JavaScript
sem tipos, um `any` — a conversão lança `TypeError` em runtime. Use `add`,
`compare`, `equals`, `lessThan`, `greaterThan` e os demais.

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
