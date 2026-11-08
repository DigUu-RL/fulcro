# Tipos numéricos

🇺🇸 English: [Read this documentation in English](../types.md)

Números com faixa e layout declarados: inteiros de largura fixa, três formatos
de ponto flutuante binário, um inteiro de qualquer tamanho e um decimal com a
semântica do decimal128 da IEEE 754 — [structs](#structs), tipos de valor
construídos a partir deles — e a [matemática](#matemática) construída sobre
todos eles: matrizes, vetores, frações, números complexos e quatérnios.

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
0.1 + 0.2; // 0.30000000000000004 — uma recompensa em créditos que deu errado
2 ** 53 + 1; // 9007199254740992 — o número de série de um clone alterado em silêncio
const channel = 70_000; // nada diz que um canal de comunicação tem 16 bits
```

O primeiro é uma fração decimal guardada em binário. O segundo é um inteiro
além dos 53 bits que um double guarda com exatidão. O terceiro é uma faixa que
ninguém escreveu, então nada a verifica. Este pacote dá a cada um desses números
o nome do que ele é, e o verifica onde ele é criado.

Os mesmos três números, cada um guardado pelo tipo que ele de fato é:

```ts
import { BigInteger, Decimal, UnsignedInteger } from '@fulcro/types';

// Créditos são decimais por natureza.
const bounty = Decimal.from('0.1').add(Decimal.from('0.2'));

console.log(bounty.toString()); // '0.3'

// Um número de série além de 2 ** 53 continua exato.
const serial = BigInteger.add(BigInteger.from(2n ** 53n), BigInteger.from(1n));

console.log(serial); // 9007199254740993n

// Um canal de comunicação tem 16 bits, e diz isso onde é criado.
const CommChannel = UnsignedInteger(16);

try {
	CommChannel.from(70_000);
} catch (error) {
	console.log((error as Error).message); // 'FULCRO6031: UnsignedInteger<16>.from: 70000 is outside [0, 65535].'
}
```

## Todo tipo tem um valor com o mesmo nome

Um tipo é apagado a caminho do JavaScript, então `SignedInteger<32>` sozinho não
verifica nada. Cada tipo vem, por isso, com um **descritor** de mesmo nome, que
converte, reconhece e calcula:

```ts
const Int32 = SignedInteger(32);

const channel: UnsignedInteger<16> = UnsignedInteger(16).from(1138);
const total: SignedInteger<32> = Int32.add(Int32.from(1), Int32.from(2));
```

Os descritores têm tipos próprios, para código que funciona com qualquer tipo
numérico: o descritor de um inteiro é um `IntegerType<T>`, o de um float um
`FloatType<T>` — um `BoundedNumericType<T, number>` que também é guardado em
bytes —, e o do `BigInteger` um `NumericType<T, TSource>`, sendo `TSource` o que
o `from` aceita. `IntegerWidth` é a união das
larguras, `8 | 16 | 32 | 64 | 128`.

```ts
import type { NumericType } from '@fulcro/types';

const sum = <T>(type: NumericType<T, unknown>, values: readonly T[], zero: T): T =>
	values.reduce((total, value) => type.add(total, value), zero);
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

Um `sum` só para qualquer tipo numérico — as tripulações de uma frota em
inteiros de 32 bits, e as leituras de escudo dos seus caças em precisão simples:

```ts
import { type NumericType, SignedInteger, SinglePrecisionFloat } from '@fulcro/types';

const sum = <T>(type: NumericType<T, unknown>, values: readonly T[], zero: T): T => {
	return values.reduce((total, value) => type.add(total, value), zero);
};

const Crew = SignedInteger(32);

const crews = [Crew.from(5_402), Crew.from(4), Crew.from(2)];
const shields = [SinglePrecisionFloat.from(0.5), SinglePrecisionFloat.from(0.25)];

console.log(sum(Crew, crews, Crew.from(0))); // 5408
console.log(sum(SinglePrecisionFloat, shields, SinglePrecisionFloat.from(0))); // 0.75
console.log(Crew.minimum, Crew.maximum); // -2147483648 2147483647
```

Se você quer só os tipos — para anotar uma interface, por exemplo — importe com
`import type` e nenhum código é carregado:

```ts
import type { SignedInteger } from '@fulcro/types';

interface Transmission {
	readonly length: SignedInteger<32>;
}
```

O cabeçalho de mensagem de um retransmissor de comunicações, tipado com os tipos
do pacote e sem levar nada do código dele:

```ts
import type { SignedInteger, UnsignedInteger } from '@fulcro/types';

interface Transmission {
	readonly channel: UnsignedInteger<16>;
	readonly length: SignedInteger<32>;
	readonly body: string;
}

// Os valores chegam já verificados, de onde quer que o retransmissor os tenha criado.
const describe = (transmission: Transmission): string => {
	return `channel ${String(transmission.channel)}, ${String(transmission.length)} characters`;
};

console.log(typeof describe); // 'function' — e nada do @fulcro/types foi carregado para defini-la
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

O contador de torpedos de um X-wing, que precisa se recusar a ficar abaixo de
vazio, ao lado do registrador de checksum de um droide astromecânico, que deve
dar a volta:

```ts
import { SignedInteger, UnsignedInteger } from '@fulcro/types';

const Torpedoes = UnsignedInteger(8);

let loaded = Torpedoes.from(2);

loaded = Torpedoes.decrement(loaded);
loaded = Torpedoes.decrement(loaded);

try {
	Torpedoes.decrement(loaded); // o Red Five atira uma terceira vez
} catch (error) {
	console.log((error as Error).message); // 'FULCRO6031: UnsignedInteger<8>.decrement: -1 is outside [0, 255].'
}

// O checksum da porta de dados do R2-D2: um registrador de 8 bits que deve dar a volta.
const Register = UnsignedInteger(8);

const checksum = [...new TextEncoder().encode('Help me, Obi-Wan Kenobi')].reduce(
	(register, byte) => Register.wrap(register + byte),
	Register.from(0),
);

console.log(checksum); // 172
console.log(SignedInteger(8).wrap(200)); // -56
```

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

Um computador de mira que informa à cabine em precisão simples, exatamente como
o seu hardware float32 informaria — e um sensor que satura além do que a meia
precisão consegue guardar:

```ts
import { HalfPrecisionFloat, SinglePrecisionFloat } from '@fulcro/types';

const rangeToTarget = SinglePrecisionFloat.from(0.1);
const correction = SinglePrecisionFloat.from(0.2);

console.log(SinglePrecisionFloat.add(rangeToTarget, correction)); // 0.30000001192092896
console.log(rangeToTarget + correction); // 0.30000000447034836 — um double que ninguém arredondou

// Um sensor térmico que registra em meia precisão.
console.log(HalfPrecisionFloat.from(1_200)); // 1200
console.log(HalfPrecisionFloat.from(65_520)); // Infinity — mais quente do que o formato consegue dizer
```

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
const bounty = Decimal.from('19.99');

bounty.multiply(Decimal.from(3)).toString(); // '59.97'
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

A Guilda dos Caçadores de Recompensa acertando um contrato em créditos: a
recompensa dividida em três, a parte da Guilda composta, e cada valor
arredondado para o livro-caixa:

```ts
import { Decimal } from '@fulcro/types';

const reward = Decimal.from('100000');
const hunters = Decimal.from(3);

const share = reward.divide(hunters);

console.log(share.toString()); // '33333.33333333333333333333333333333'
console.log(share.round(2).toString()); // '33333.33' — o que cada caçador recebe
console.log(reward.remainder(Decimal.from(7)).toString()); // '5' — exato, sempre

// A Guilda fica com 10 por cento, compostos ao longo de um contrato de dois anos.
const guildRate = Decimal.from('1.1').power(Decimal.from(2));

console.log(guildRate.toString()); // '1.21'
console.log(reward.multiply(guildRate).toString()); // '121000'

console.log(Decimal.from('2.345').round(2, 'halfAwayFromZero').toString()); // '2.35'
console.log(Decimal.from('12345678901234567890').toString()); // '12345678901234567890' — nenhum dígito perdido
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

Um saldo em créditos entregue a um código que escapou dos tipos:

```ts
import { Decimal } from '@fulcro/types';

const balance = Decimal.from('2000.50');

// Imagine que isto chegou por um `any`, vindo do firmware sem tipos de um droide.
const untyped = balance as unknown as number;

try {
	console.log(untyped + 1);
} catch (error) {
	console.log(error instanceof TypeError); // true — a conversão também é recusada em runtime
}

console.log(`Balance: ${balance} credits`); // 'Balance: 2000.5 credits'
console.log(balance.add(Decimal.from(1)).toString()); // '2001.5'
```

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

O censo imperial somando os stormtroopers de dois setores — o operador estoura
em silêncio, o método recusa:

```ts
import { Decimal, SignedInteger } from '@fulcro/types';

const Census = SignedInteger(32);

const outerRim = Census.from(2_000_000_000);
const coreWorlds = Census.from(2_000_000_000);

console.log(outerRim + coreWorlds); // 4000000000 — já não é um SignedInteger<32>, e ninguém percebeu

try {
	Census.add(outerRim, coreWorlds);
} catch (error) {
	console.log((error as Error).message);
	// 'FULCRO6031: SignedInteger<32>.add: 4000000000 is outside [-2147483648, 2147483647].'
}

console.log(Census.lessThan(coreWorlds, outerRim)); // false

const paid = Decimal.from('0.1').add(Decimal.from('0.2'));

console.log(paid === Decimal.from('0.3'), paid.equals(Decimal.from('0.3'))); // false true
```

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

O layout mora no tipo, nunca num valor: um import só de tipo basta para o
`sizeOf`, e nada deste pacote é carregado para respondê-lo. Veja
[Reflexão](./reflect.md#sizeoft-e-alignoft) para como os dois se
encontram. O descritor também traz os mesmos números em runtime, como `layout`,
para o código que guarda valores em bytes.

Os mesmos tamanhos, lidos em tempo de compilação a partir dos tipos e em runtime
a partir dos descritores, para um lançamento no livro da Guilda:

```ts
import { alignOf, sizeOf } from '@fulcro/reflect';
import { Decimal, SignedInteger } from '@fulcro/types';

console.log(sizeOf<SignedInteger<32>>(), SignedInteger(32).layout.size); // 4 4
console.log(alignOf<Decimal>(), Decimal.layout.alignment); // 16 16
```

### Guardado em bytes

O descritor de cada tipo dessa tabela lê e escreve um valor em bytes, num
`DataView`, em little-endian qualquer que seja a plataforma:

```ts
const Int32 = SignedInteger(32);
const view = new DataView(new ArrayBuffer(Int32.layout.size * 2));

Int32.write(view, Int32.layout.size, Int32.from(-2));
Int32.read(view, Int32.layout.size); // -2
```

A codificação é a mesma que um campo de struct desse tipo usa — complemento de
dois para os inteiros, IEEE 754 binary16, binary32 e binary64 para os floats,
decimal128 na codificação de inteiro binário para o `Decimal` —, então um valor
escrito sozinho e o mesmo valor dentro de uma struct são os mesmos bytes. É isso
que permite ao [`@fulcro/memory`](./memory.md) guardar um tipo numérico sem uma
struct em volta.

O layout também nomeia essa codificação em runtime, como `layout.encoding`, com
as palavras que a linguagem usa para os seus typed arrays:

```ts
SignedInteger(32).layout; // { size: 4, alignment: 4, encoding: 'Int32' }
```

`'Int8'`, `'Uint8'`, `'Int16'`, `'Uint16'`, `'Int32'` e `'Uint32'` para os
inteiros de até 32 bits, `'BigInt64'` e `'BigUint64'` em 64, e `'Int128'` e
`'Uint128'`, no mesmo padrão, em 128; `'Float16'`, `'Float32'` e `'Float64'`
para os floats; `'Decimal128'` para o `Decimal`. O layout de uma struct não tem
nenhuma — os bytes dela são os dos campos. O `@fulcro/memory` a lê para guardar
muitos valores no typed array de mesmo nome: veja
[Guardado num typed array](./memory.md#guardado-num-typed-array).

Um offset em que o valor não cabe é recusado antes de qualquer byte ser tocado,
com [`FULCRO6018`](./errors/FULCRO6xxx.md#fulcro6018). O `write` não confere o
valor de novo: o compilador já recusa um `number` comum onde se espera um
`SignedInteger<32>`, e uma storage o confere com `is` antes de escrever.

Os descritores são tipados por contratos que o pacote exporta: `IntegerType<T>`
para os inteiros, `FloatType<T>` para os três floats, e `FixedLayoutType<T>` —
só `layout`, `read` e `write`, que todo tipo da tabela tem — para o código que
guarda qualquer um deles:

```ts
import type { FixedLayoutType } from '@fulcro/types';

const zeroed = <T>(type: FixedLayoutType<T>, count: number): DataView => {
	return new DataView(new ArrayBuffer(type.layout.size * count));
};

zeroed(SignedInteger(32), 8); // 32 bytes
zeroed(Decimal, 2); // 32 bytes
```

O registro de lote da instalação de clonagem de Kamino — números de série e
taxas de crescimento escritos em bytes e lidos de volta, por uma função que
serve para qualquer tipo com layout fixo:

```ts
import { Decimal, type FixedLayoutType, SignedInteger } from '@fulcro/types';

const zeroed = <T>(type: FixedLayoutType<T>, count: number): DataView => {
	return new DataView(new ArrayBuffer(type.layout.size * count));
};

const Serial = SignedInteger(32);
const serials = zeroed(Serial, 3);

Serial.write(serials, Serial.layout.size * 2, Serial.from(7567)); // o número do Capitão Rex

console.log(Serial.read(serials, Serial.layout.size * 2)); // 7567
console.log(Serial.read(serials, 0)); // 0 — toda posição começa em zero
console.log(serials.byteLength, Serial.layout.encoding); // 12 'Int32'

const growthRates = zeroed(Decimal, 2);

Decimal.write(growthRates, Decimal.layout.size, Decimal.from('2.0'));

console.log(Decimal.read(growthRates, Decimal.layout.size).toString()); // '2' — os clones envelhecem duas vezes mais rápido
console.log(growthRates.byteLength, Decimal.layout.encoding); // 32 'Decimal128'
```

## Structs

Um struct é um **tipo de valor** com layout fixo, construído a partir dos tipos
acima e de outros structs. Como os tipos numéricos, ele tem um valor e um tipo
com o mesmo nome:

```ts
import { SinglePrecisionFloat, struct, type Struct } from '@fulcro/types';

export const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
export type Starfighter = Struct<typeof Starfighter>;

const fresh: Starfighter = Starfighter.from({ shields: 1, hull: 1, speed: 0.5 });
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
campos — `Starfighter.equals(a, b)` — nunca por `===`, que continua comparando
os dois objetos. Cada campo compara como o próprio tipo compara: um campo `NaN`
torna um valor diferente de si mesmo. Uma struct guardada dentro de outros
dados — um array de caças, um map de esquadrões — é comparada do mesmo jeito
passando o descritor dela ao
[`createEquals`](./functions.md#suas-próprias-regras-createequals) como regra.

Dois relatórios de estado do Red Five, feitos separadamente e comparados como os
valores que são:

```ts
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
type Starfighter = Struct<typeof Starfighter>;

const fromR2: Starfighter = Starfighter.from({ shields: 0.6, hull: 1, speed: 0.5 });
const fromBase: Starfighter = Starfighter.from({ shields: 0.6, hull: 1, speed: 0.5 });

console.log(fromR2.shields); // 0.6000000238418579 — o valor de precisão simples mais próximo
console.log(fromR2 === fromBase); // false — dois objetos
console.log(Starfighter.equals(fromR2, fromBase)); // true — o mesmo valor
console.log(Object.isFrozen(fromR2)); // true

try {
	(fromR2 as { shields: number }).shields = 1;
} catch (error) {
	console.log(error instanceof TypeError); // true — um valor não pode ser remendado no lugar
}
```

### Métodos

Um terceiro argumento dá a todo valor do struct os seus métodos, com `this`
sendo o valor:

```ts
export const Starfighter = struct(
	'Starfighter',
	{ shields: SinglePrecisionFloat, hull: SinglePrecisionFloat, speed: SinglePrecisionFloat },
	{
		integrity() {
			return (this.shields + this.hull) / 2;
		},
		hit(damage: number) {
			return Starfighter.from({
				shields: Math.max(0, this.shields - damage),
				hull: this.shields > damage ? this.hull : Math.max(0, this.hull - (damage - this.shields)),
				speed: this.speed,
			});
		},
	},
);
export type Starfighter = Struct<typeof Starfighter>; // inclui integrity() e hit()

Starfighter.from({ shields: 0.5, hull: 1, speed: 0.5 }).integrity(); // 0.75
```

Os métodos ficam num único protótipo compartilhado por todos os valores, e não
em cada valor. Eles não ocupam bytes e não são campos: o layout, o `equals` e os
bytes são os que os campos sozinhos produzem, e um valor lido de bytes tem os
seus métodos como um criado pelo `from`. Escreva-os como métodos, não como arrow
functions, para que `this` seja o valor.

Um valor continua congelado, então um método não o altera: ele devolve um valor
novo, como o `hit` faz. Um método com o nome de um campo, de um índice de
array ou `~layout`, ou que não seja uma função, é um `TypeError` na declaração
do struct.

Num struct com métodos, o `is` também confere que o valor foi criado pelo
struct: um objeto só com os campos certos não carrega os métodos, então não é
um valor dele. Um struct sem métodos continua reconhecendo esse objeto, como
sempre.

Um valor que atravessa a fronteira de um worker ou passa por JSON perde os
métodos: o structured clone por trás do `postMessage` não preserva protótipos,
então o que chega são só os campos. Recrie-o com `Starfighter.from(value)` do
outro lado.

O Red Five levando tiros na trincheira, cada tiro um valor novo, e um relatório
que atravessou o link de comunicação recriado como um valor:

```ts
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const Starfighter = struct(
	'Starfighter',
	{ shields: SinglePrecisionFloat, hull: SinglePrecisionFloat, speed: SinglePrecisionFloat },
	{
		integrity() {
			return (this.shields + this.hull) / 2;
		},
		hit(damage: number) {
			return Starfighter.from({
				shields: Math.max(0, this.shields - damage),
				hull: this.shields > damage ? this.hull : Math.max(0, this.hull - (damage - this.shields)),
				speed: this.speed,
			});
		},
	},
);
type Starfighter = Struct<typeof Starfighter>;

const redFive: Starfighter = Starfighter.from({ shields: 0.5, hull: 1, speed: 0.5 });
const afterTheTurbolasers = redFive.hit(0.75);

console.log(redFive.integrity()); // 0.75 — sem mudança pelo tiro
console.log(afterTheTurbolasers.shields, afterTheTurbolasers.hull); // 0 0.75
console.log(afterTheTurbolasers.integrity()); // 0.375

// Enviado a Yavin como JSON, chega só como campos.
const received: unknown = JSON.parse(JSON.stringify(afterTheTurbolasers));

console.log(Starfighter.is(received)); // false — sem métodos, então não é um Starfighter
console.log(Starfighter.from(received as Starfighter).integrity()); // 0.375 — recriado deste lado
```

### Onde os campos ficam

Os campos são posicionados por alinhamento, do maior para o menor, e na ordem
de declaração entre iguais. Todo tamanho é múltiplo do próprio alinhamento,
então nenhum campo precisa de padding antes dele; só o fim do struct recebe
padding, até o alinhamento dele, para que o próximo num array comece alinhado.

```ts
const SensorReading = struct('SensorReading', {
	alert: UnsignedInteger(8), // offset 10
	distance: DoublePrecisionFloat, // offset 0
	contacts: UnsignedInteger(16), // offset 8
});

SensorReading.layout.size; // 16: onze bytes, com padding até o alinhamento 8
sizeOf<Struct<typeof SensorReading>>(); // 16, em tempo de compilação
```

Os campos não ficam na ordem de declaração com padding entre eles. Esta ordem é
a que torna o tamanho calculável pelo type checker — o que permite ao `sizeOf`
responder em tempo de compilação — e que não desperdiça nenhum byte dentro do
struct.

O `layout` dá o offset, o tamanho e o alinhamento de cada campo em runtime. Um
struct aninhado como campo fica inline, como um campo com o próprio tamanho.

As mesmas respostas existem em tempo de compilação, pelo
[`@fulcro/reflect`](./reflect.md#offsetoftfield-e-layoutoft), só a partir
do tipo:

```ts
offsetOf<Struct<typeof SensorReading>>('alert'); // 10
layoutOf<Struct<typeof SensorReading>>(); // igual a SensorReading.layout
```

O tipo de um valor de struct lista, no `'~layout'`, o tamanho e o alinhamento
de cada campo, na ordem de declaração, mas não o offset — um offset depende
dessa ordem, que um tipo não promete. O transformer posiciona os campos pela
regra acima, e um teste garante que a resposta dele é a mesma do `layout`.

As leituras do sensor de longo alcance da Base Echo, com o layout calculado em
runtime e em tempo de compilação, chegando à mesma resposta:

```ts
import { layoutOf, offsetOf, sizeOf } from '@fulcro/reflect';
import { DoublePrecisionFloat, type Struct, struct, UnsignedInteger } from '@fulcro/types';

const SensorReading = struct('SensorReading', {
	alert: UnsignedInteger(8),
	distance: DoublePrecisionFloat,
	contacts: UnsignedInteger(16),
});
type SensorReading = Struct<typeof SensorReading>;

console.log(SensorReading.layout.fields.distance.offset); // 0
console.log(SensorReading.layout.fields.contacts.offset); // 8
console.log(SensorReading.layout.fields.alert.offset); // 10
console.log(SensorReading.layout.size); // 16

console.log(sizeOf<SensorReading>()); // 16 — só a partir do tipo
console.log(offsetOf<SensorReading>('alert')); // 10
console.log(layoutOf<SensorReading>().size === SensorReading.layout.size); // true
```

### Bytes

Um valor pode ser escrito num `DataView` e lido de volta, que é como um struct
é guardado sem um objeto por valor — um buffer de mil caças ocupa doze mil
bytes:

```ts
const buffer = new ArrayBuffer(Starfighter.layout.size * 1000);
const view = new DataView(buffer);

Starfighter.write(view, Starfighter.layout.size * 7, fresh);
Starfighter.read(view, Starfighter.layout.size * 7); // { shields: 1, hull: 1, speed: 0.5 }
```

Todo valor é little-endian, em qualquer plataforma. Inteiros são complemento de
dois, os floats são binary16, binary32 e binary64 da IEEE 754, e o `Decimal` é
decimal128 da IEEE 754 na codificação de inteiro binário. Bytes de padding
ficam como estavam. Um offset em que o struct não cabe é um `RangeError`,
lançado antes de qualquer byte ser escrito.

O `read` cria um objeto novo a cada chamada: guardar um valor não custa um
objeto, segurar um ainda custa.

O estado de todos os caças de uma frota de mil naves, guardado em bytes em vez
de em mil objetos:

```ts
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
type Starfighter = Struct<typeof Starfighter>;

const fleet = new DataView(new ArrayBuffer(Starfighter.layout.size * 1_000));

Starfighter.write(
	fleet,
	Starfighter.layout.size * 7,
	Starfighter.from({ shields: 1, hull: 1, speed: 0.5 }),
);

const seventh = Starfighter.read(fleet, Starfighter.layout.size * 7);
const untouched = Starfighter.read(fleet, Starfighter.layout.size * 8);

console.log(fleet.byteLength); // 12000
console.log(seventh); // { shields: 1, hull: 1, speed: 0.5 }
console.log(untouched); // { shields: 0, hull: 0, speed: 0 } — zerado até ser escrito

try {
	Starfighter.read(fleet, fleet.byteLength - 4);
} catch (error) {
	console.log(error instanceof RangeError); // true — recusado antes de qualquer byte ser lido
}
```

## Matemática

```ts
import { ComplexNumber, Fraction, Matrix, Quaternion, Vector } from '@fulcro/types';
```

Cinco tipos construídos sobre os numéricos, cada um declarado do mesmo jeito —
uma função que recebe o tipo de que seus componentes são feitos — e cada um
fazendo a aritmética pelo descritor desse tipo. Uma matriz de
`SignedInteger(8)` lança onde um elemento sairia da faixa; uma de
`SinglePrecisionFloat` arredonda cada produto e cada soma como esse tipo
arredonda; uma de `Decimal` é exata onde um double não é:

```ts
const Credits = Matrix(Decimal, 1, 2);

Credits.add(Credits.from([[0.1, 0.2]]), Credits.from([[0.2, 0.1]])).map(String);
// ['0.3', '0.3']
```

O tipo dos componentes pode ser qualquer tipo numérico deste pacote —
`BigInteger` e `Decimal` inclusive — ou uma `Fraction`, um `ComplexNumber` ou
um `Quaternion`, então uma matriz de números complexos é uma matriz como
qualquer outra. Quando o tipo dos componentes declara um layout, o tipo
construído sobre ele também declara, com os componentes em sequência; ele pode
então ser campo de uma [struct](#structs), e o
[`sizeOf`](./reflect.md#sizeoft-e-alignoft) o lê do tipo.

O faturamento de duas cantinas, em créditos e num livro de decimais, somado sem
perder uma fração de crédito:

```ts
import { Decimal, Matrix } from '@fulcro/types';

// Uma linha: a mesa de sabacc e o bar.
const Takings = Matrix(Decimal, 1, 2);

const mosEisley = Takings.from([[0.1, 0.2]]);
const cantoBight = Takings.from([[0.2, 0.1]]);

console.log(Takings.add(mosEisley, cantoBight).map(String)); // ['0.3', '0.3']
console.log([0.1 + 0.2, 0.2 + 0.1]); // [0.30000000000000004, 0.30000000000000004] — o que números comuns fazem disso
```

### Matrizes e vetores

```ts
const Transform = Matrix(SinglePrecisionFloat, 3, 4);
const Point = Vector(SinglePrecisionFloat, 4, 1);

const jump = Transform.from([
	[1, 0, 0, 5],
	[0, 1, 0, 0],
	[0, 0, 1, 0],
]);
const falcon = Point.from([1, 2, 3, 1]);

Transform.multiply(jump, falcon); // [6, 2, 3] — uma Matrix<SinglePrecisionFloat, 3, 1>
```

As dimensões são parâmetros de tipo, nunca parte de um nome: não existe
`Matrix3x4` nem `Vector3D`. Um vetor é uma matriz com uma linha ou uma coluna,
e `Vector<T, 4, 1>` é o mesmo tipo que `Matrix<T, 4, 1>`, então um vetor vai
aonde a matriz da sua forma vai.

As formas são checadas pelo compilador, sem plugin nenhum:

```ts
Transform.multiply(jump, jump);
// Cannot multiply Matrix<T, 3, 4> by Matrix<T, 3, 4>. Expected a matrix with 4 rows.

Transform.identity(); // erro: só uma matriz quadrada tem identidade
Vector(SinglePrecisionFloat, 2, 3); // erro: um vetor tem uma linha ou uma coluna
```

As mesmas checagens rodam em runtime para quem passou pelo compilador — com
`as never`, por exemplo — e lançam as mesmas frases
([FULCRO6037](./errors/FULCRO6xxx.md#fulcro6037) e vizinhos).

Um valor é um array congelado dos seus elementos, linha após linha, então ele
indexa, espalha e serializa como os números que contém; `rows` e `columns`
ficam nele sem ser listados:

```ts
jump[3]; // 5 — linha 0, coluna 3
[jump.rows, jump.columns]; // [3, 4]
JSON.stringify(falcon); // '[1,2,3,1]'
```

| Operação                | O que faz                                                          |
| ----------------------- | ------------------------------------------------------------------ |
| `from(rows)`            | cria uma matriz a partir das linhas; um vetor, de uma lista        |
| `is`, `equals`          | reconhecem e comparam, elemento a elemento                         |
| `add`, `subtract`       | elemento a elemento, mesma forma                                   |
| `negate`, `scale`       | todo elemento, ou todo elemento vezes um valor                     |
| `multiply(left, right)` | o produto de matrizes, R × C por C × K dando R × K                 |
| `transpose(value)`      | linhas e colunas trocadas                                          |
| `identity()`            | a identidade de uma matriz quadrada, feita uma vez e compartilhada |
| `dot(left, right)`      | o produto escalar de um vetor, no tipo do elemento                 |

O produto de uma matriz R × C por uma C × K pede ao tipo do elemento
exatamente R·C·K multiplicações e R·(C−1)·K adições — nenhum zero convertido
para começar uma soma, nada calculado duas vezes — e a suíte de performance as
conta.

O computador de navegação da Falcon movendo a nave cinco unidades ao longo da
rota hiperespacial, e conferindo o quanto dois rumos concordam:

```ts
import { Matrix, SinglePrecisionFloat, Vector } from '@fulcro/types';

// Uma translação de cinco unidades em x, escrita como uma transformação afim.
const Transform = Matrix(SinglePrecisionFloat, 3, 4);
const Position = Vector(SinglePrecisionFloat, 4, 1);
const Heading = Vector(SinglePrecisionFloat, 3, 1);

const jump = Transform.from([
	[1, 0, 0, 5],
	[0, 1, 0, 0],
	[0, 0, 1, 0],
]);

const falcon = Position.from([1, 2, 3, 1]);

const arrived = Transform.multiply(jump, falcon);

console.log([...arrived]); // [6, 2, 3]
console.log([arrived.rows, arrived.columns]); // [3, 1]
console.log(jump[3], JSON.stringify(falcon)); // 5 '[1,2,3,1]'

const toKessel = Heading.from([1, 0, 0]);
const toTheMaw = Heading.from([0, 1, 0]);

console.log(Heading.dot(toKessel, toTheMaw)); // 0 — os dois rumos estão em ângulo reto
console.log([...Transform.transpose(jump)].length); // 12
```

### Frações

```ts
const Spoils = Fraction(SignedInteger(32));
const third = Spoils.from({ numerator: 1, denominator: 3 });

Spoils.add(third, third); // { numerator: 2, denominator: 3 }
Spoils.from({ numerator: 6, denominator: -4 }); // { numerator: -3, denominator: 2 }
Spoils.lessThan(third, Spoils.from(0)); // false
```

Um racional exato sobre um tipo inteiro: `SignedInteger(n)`,
`UnsignedInteger(n)` ou `BigInteger`. Sempre em termos mínimos com
denominador positivo, então duas frações são iguais exatamente quando as
partes são. Uma fração é um tipo numérico completo — os mesmos `add`,
`divide`, `power`, `lessThan` e o resto dos tipos acima — então ela também pode
ser elemento de uma matriz.

Toda operação é exata; o que pode falhar é o tipo inteiro por baixo. Os fatores
comuns são cancelados antes de multiplicar, então um intermediário fica tão
pequeno quanto o resultado permite, mas um que saia da faixa do inteiro ainda
lança o `RangeError` dele. Sobre `BigInteger` nada estoura. `power` recebe um
expoente inteiro, já que uma potência fracionária de um racional raramente é
racional.

Uma tripulação de contrabandistas dividindo um carregamento de coaxium — partes
exatas, sejam quais forem os denominadores:

```ts
import { Fraction, SignedInteger } from '@fulcro/types';

const Share = Fraction(SignedInteger(32));

const han = Share.from({ numerator: 1, denominator: 2 });
const chewie = Share.from({ numerator: 1, denominator: 3 });
const lando = Share.subtract(Share.subtract(Share.from(1), han), chewie);

console.log(lando); // { numerator: 1, denominator: 6 }
console.log(Share.add(han, chewie)); // { numerator: 5, denominator: 6 }
console.log(Share.from({ numerator: 6, denominator: -4 })); // { numerator: -3, denominator: 2 }
console.log(Share.greaterThan(han, chewie)); // true — o Han fica com a parte maior, como sempre
```

### Números complexos e quatérnios

```ts
const Complex = ComplexNumber(DoublePrecisionFloat);
const i = Complex.from({ real: 0, imaginary: 1 });

Complex.multiply(i, i); // { real: -1, imaginary: 0 }
Complex.from(2); // { real: 2, imaginary: 0 }

const Rotation = Quaternion(DoublePrecisionFloat);
const qi = Rotation.from({ w: 0, x: 1, y: 0, z: 0 });
const qj = Rotation.from({ w: 0, x: 0, y: 1, z: 0 });

Rotation.multiply(qi, qj); // { w: 0, x: 0, y: 0, z: 1 } — k
Rotation.multiply(qj, qi); // { w: 0, x: 0, y: 0, z: -1 } — a ordem importa
```

Os dois compartilham tudo menos o produto: `add`, `subtract`, `negate`,
`scale`, `conjugate` — que nega toda parte imaginária — e `divide`, que
multiplica pelo conjugado do divisor sobre o quadrado da sua norma. Não há
`lessThan`: nenhum dos dois tem uma ordem que concorde com a sua aritmética.
Dividir por zero faz o que a divisão do tipo dos componentes faz — `NaN` para
um float, um erro para um inteiro.

Um X-wing girando para entrar na trincheira: duas manobras em eixos diferentes,
aplicadas em qualquer ordem, e a fase de um escudo defletor como número
complexo:

```ts
import { ComplexNumber, DoublePrecisionFloat, Quaternion } from '@fulcro/types';

const Rotation = Quaternion(DoublePrecisionFloat);

// Os quatérnios unitários i e j: meias-voltas nos eixos x e y.
const roll = Rotation.from({ w: 0, x: 1, y: 0, z: 0 });
const pitch = Rotation.from({ w: 0, x: 0, y: 1, z: 0 });

console.log(Rotation.multiply(roll, pitch)); // { w: 0, x: 0, y: 0, z: 1 }
console.log(Rotation.multiply(pitch, roll)); // { w: 0, x: 0, y: 0, z: -1 } — a ordem das manobras importa
console.log(Rotation.conjugate(roll)); // { w: 0, x: -1, y: -0, z: -0 }

const Phase = ComplexNumber(DoublePrecisionFloat);
const quarterTurn = Phase.from({ real: 0, imaginary: 1 });

console.log(Phase.multiply(quarterTurn, quarterTurn)); // { real: -1, imaginary: 0 } — dois quartos de volta invertem o escudo
console.log(Phase.from(2)); // { real: 2, imaginary: 0 }
```
