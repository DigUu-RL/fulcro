# FULCRO6xxx — `@fulcro/types`

🇺🇸 English: [Read this documentation in English](../../errors/FULCRO6xxx.md)

Os erros dos [tipos numéricos e structs](../types.md). Voltar para
[todos os códigos](../errors.md).

Um tipo numérico recusa um valor que não consegue guardar exatamente, em vez de
arredondá-lo, dar a volta ou truncá-lo por você. Quando encaixar o valor em
silêncio é o que você quer, cada tipo diz isso pelo nome: `wrap()` num inteiro,
um modo de arredondamento num `Decimal`.

As mensagens começam pela operação que recusou — `SignedInteger<8>.add`,
`Decimal.round`, `Vector3.from` — então o nome do tipo está sempre na sua
frente.

## FULCRO6001

```text
RangeError: FULCRO6001: SignedInteger<32>.divide: division by zero.
```

`divide()` ou `remainder()` de um tipo inteiro ou de `BigInteger` recebeu um
divisor zero. Um inteiro não tem infinito com que responder.

## FULCRO6002

```text
RangeError: FULCRO6002: SignedInteger<32>.from: expected an integer, received 1.5.
```

Uma conversão para inteiro recebeu um número com parte fracionária, ou um que
não é finito: `from()` ou `wrap()` de um tipo inteiro, `BigInteger.from()`, ou
`Decimal.toBigInt()` de um decimal que não é inteiro.

Arredonde o valor antes, decidindo como, e converta o resultado.

## FULCRO6003

```text
SyntaxError: FULCRO6003: BigInteger.from: expected decimal digits with an optional sign, received "0x10".
```

`BigInteger.from()` recebeu uma string que não é formada por dígitos decimais.
Hexadecimal, expoentes, separadores e espaços em volta são todos recusados,
para que ninguém se surpreenda com o que uma string queria dizer.

## FULCRO6004

```text
TypeError: FULCRO6004: BigInteger.from: expected a number, a bigint or a string, received object.
```

`BigInteger.from()` recebeu um valor de um tipo que ele não converte.

## FULCRO6005

```text
RangeError: FULCRO6005: SignedInteger<32>.power: expected an exponent of zero or more, received -1.
```

`power()` de um tipo inteiro ou de `BigInteger` recebeu um expoente negativo,
cujo resultado é uma fração que nenhum inteiro consegue guardar.

## FULCRO6006

```text
TypeError: FULCRO6006: SinglePrecisionFloat.from: expected a number, received string.
```

`from()` de `HalfPrecisionFloat`, `SinglePrecisionFloat` ou
`DoublePrecisionFloat` recebeu algo que não é um número. Uma string é recusada
em vez de interpretada, porque interpretá-la e depois arredondar para o formato
pode cair no vizinho errado.

## FULCRO6007

```text
RangeError: FULCRO6007: Decimal.round: expected a rounding mode of ceiling, floor, truncate, halfEven, halfAwayFromZero, received "nearest".
```

Uma operação de `Decimal` recebeu um modo de arredondamento que não é nenhum dos
cinco que ele conhece.

## FULCRO6008

```text
TypeError: FULCRO6008: struct Point: expected an object of methods, received null.
```

O terceiro argumento de `struct()` foi passado, e não é um objeto.

## FULCRO6009

```text
TypeError: FULCRO6009: struct Point: method 'x' has the name of a field; a value could not hold both.
```

Um método de uma `struct()` tem o mesmo nome de um dos seus campos. Renomeie um
dos dois.

## FULCRO6010

```text
TypeError: FULCRO6010: struct Point: '0' cannot name a method; …
```

Um método de uma `struct()` tem nome de índice de array, ou `~layout`. A
linguagem moveria um índice para antes de todas as outras chaves, e `~layout` é
o nome sob o qual o próprio layout é declarado.

## FULCRO6011

```text
TypeError: FULCRO6011: struct Point: method 'length' must be a function, received number.
```

Uma entrada do objeto de métodos de uma `struct()` não é uma função.

## FULCRO6012

```text
TypeError: FULCRO6012: struct: expected a name, received undefined.
```

`struct()` foi chamada sem nome, ou com um nome vazio. O nome é o início de toda
mensagem sobre a struct.

## FULCRO6013

```text
TypeError: FULCRO6013: struct Point: expected an object of fields, received undefined.
```

O segundo argumento de `struct()` não é um objeto.

## FULCRO6014

```text
TypeError: FULCRO6014: struct Empty: expected at least one field.
```

`struct()` não recebeu nenhum campo. Uma struct sem nada dentro não tem layout
para declarar.

## FULCRO6015

```text
TypeError: FULCRO6015: struct Point: '0' cannot name a field; …
```

Um campo de uma `struct()` tem nome de índice de array, ou `~layout`. Um índice
seria reordenado para antes dos outros campos — e a ordem dos campos é o
layout.

## FULCRO6016

```text
TypeError: FULCRO6016: struct Account: field 'balance' has no fixed layout. …
```

Um campo de uma `struct()` foi declarado com um tipo que não tem tamanho fixo:
`BigInteger`, ou algo que nem é um tipo numérico. Declare-o com um tipo
numérico de largura fixa, ou com outra struct.

## FULCRO6017

```text
TypeError: FULCRO6017: Vector3.write: expected a DataView, received object.
```

`read()` ou `write()` de uma struct recebeu algo que não é um `DataView`.
Envolva o buffer: `new DataView(buffer)`.

## FULCRO6018

```text
RangeError: FULCRO6018: Vector3.write: 12 bytes at offset 4 do not fit in a view of 12 bytes.
```

`read()` ou `write()` de uma struct recebeu um offset negativo, não inteiro, ou
perto demais do fim para os `layout.size` bytes da struct. O view não é
alterado.

## FULCRO6019

```text
TypeError: FULCRO6019: Vector3.from: expected an object, received null.
```

`from()` de uma struct recebeu algo que não é um objeto.

## FULCRO6020

```text
TypeError: FULCRO6020: Vector3.from: 'w' is not a field; the fields are x, y, z.
```

`from()` de uma struct recebeu uma propriedade que a struct não declara. Ela é
recusada em vez de descartada, para que um campo com o nome errado não se perca
em silêncio.

## FULCRO6021

```text
TypeError: FULCRO6021: Vector3.from: missing field 'z'.
```

`from()` de uma struct não recebeu um dos seus campos. Todo campo é
obrigatório; não existe valor padrão para preencher.

## FULCRO6022

```text
RangeError: FULCRO6022: Decimal.toFixed: expected an integer from 0 to 100, received -1.
```

`toFixed()`, `toPrecision()` ou `toExponential()` de um `Decimal` recebeu um
número de dígitos fora da faixa que o método correspondente de `Number` aceita.

## FULCRO6023

```text
SyntaxError: FULCRO6023: Decimal.from: expected a decimal literal, received "1.2.3".
```

`Decimal.from()` recebeu uma string que não é um número decimal.

## FULCRO6024

```text
TypeError: FULCRO6024: Decimal.from: expected a Decimal, a string, a number or a bigint, received object.
```

`Decimal.from()` recebeu um valor de um tipo que ele não converte.

## FULCRO6025

```text
RangeError: FULCRO6025: Decimal.power: expected an integer exponent, received 0.5.
```

`power()` de um `Decimal` recebeu um expoente que não é inteiro, ou que não é
finito.

## FULCRO6026

```text
RangeError: FULCRO6026: Decimal.round: expected an integer number of places, received 1.5.
```

`round(places)` de um `Decimal` recebeu um número de casas que não é um inteiro
seguro.

## FULCRO6027

```text
TypeError: FULCRO6027: Decimal cannot be converted to a primitive implicitly: …
```

Um `Decimal` foi usado com um operador — `+`, `<`, a aritmética de um template
literal — que primeiro o transformaria num número de ponto flutuante binário e
perderia os dígitos que ele existe para guardar.

Use os seus métodos: `add()`, `compare()`, `toString()`.

## FULCRO6028

```text
TypeError: FULCRO6028: SignedInteger<32>.from: expected a number or a bigint, received string.
```

`from()` ou `wrap()` de um tipo inteiro recebeu algo que não é um `number` nem
um `bigint`.

## FULCRO6029

```text
RangeError: FULCRO6029: SignedInteger<32>.shiftLeft: expected a count from 0 to 31, received 32.
```

Um deslocamento de bits de um tipo inteiro recebeu uma contagem fora da largura
do tipo.

## FULCRO6030

```text
RangeError: FULCRO6030: SignedInteger: expected a width of 8, 16, 32, 64, 128 bits, received 12.
```

`SignedInteger(width)` ou `UnsignedInteger(width)` recebeu uma largura que não
existe. A mensagem lista as larguras disponíveis.

## FULCRO6031

```text
RangeError: FULCRO6031: SignedInteger<8>.add: 200 is outside [-128, 127].
```

Uma operação de inteiro produziu — ou recebeu — um valor fora da faixa do tipo:
`from()`, `add()`, `subtract()`, `multiply()`, `divide()`, `remainder()`,
`negate()`, `increment()`, `decrement()` ou `power()`.

Use `wrap()` quando a volta em complemento de dois for o que você quer, ou um
tipo mais largo quando não for.

## FULCRO6032

```text
RangeError: FULCRO6032: SignedInteger<64>.power: 3n ** 200n is outside [-9223372036854775808, 9223372036854775807].
```

`power()` de um tipo inteiro de 64 ou 128 bits produziria um resultado fora da
sua faixa. Ele é recusado antes de o resultado ser calculado, o que, para um
expoente grande, já seria caro por si só.
