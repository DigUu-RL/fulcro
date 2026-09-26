# Códigos de erro

🇺🇸 English: [Read this documentation in English](../errors.md)

Todo erro lançado por um pacote `@fulcro` carrega um código. O código fica no
início da mensagem e no próprio erro:

```text
TypeError: FULCRO6021: Vector3.from: missing field 'x'.
```

```ts
try {
	Vector3.from(payload);
} catch (error) {
	if ((error as { code?: string }).code === 'FULCRO6021') {
		// falta um campo — peça de novo
	}
}
```

O código é a parte da qual depender. O texto depois dele pode ser melhorado em
qualquer versão; o código mantém o significado e nunca é reaproveitado para
outra coisa, mesmo depois que o erro que ele nomeava deixa de existir.

A classe também não muda. Um erro que era `RangeError` antes de ter código
continua sendo `RangeError`, então as verificações com `instanceof` continuam
funcionando.

## De onde vem um código

O primeiro dígito indica o pacote que o lançou:

| Faixa        | Pacote                   | Códigos                              |
| ------------ | ------------------------ | ------------------------------------ |
| `FULCRO1xxx` | `@fulcro/collections`    | [FULCRO1xxx](./errors/FULCRO1xxx.md) |
| `FULCRO2xxx` | `@fulcro/functions`      | [FULCRO2xxx](./errors/FULCRO2xxx.md) |
| `FULCRO3xxx` | `@fulcro/parallel`       | [FULCRO3xxx](./errors/FULCRO3xxx.md) |
| `FULCRO4xxx` | `@fulcro/reflect`        | [FULCRO4xxx](./errors/FULCRO4xxx.md) |
| `FULCRO5xxx` | `@fulcro/transform-core` | [FULCRO5xxx](./errors/FULCRO5xxx.md) |
| `FULCRO6xxx` | `@fulcro/types`          | [FULCRO6xxx](./errors/FULCRO6xxx.md) |

Cada página tem uma seção por código, com link próprio no formato
`FULCRO6xxx.md#fulcro6021`: o que ele significa, o que costuma causá-lo e o que
escrever no lugar.

## Um erro dentro de outro

Alguns erros acontecem um nível abaixo do que você chamou. Converter uma struct
converte cada um dos seus campos, e um campo que recusa o seu valor recusa a
struct inteira. O erro mantém o código e a classe do campo, e ganha o lugar onde
foi encontrado:

```text
RangeError: FULCRO6031: Particle.from: field 'charge': UnsignedInteger<8>.from: 300 is outside [0, 255].
```

O erro original, como o campo o lançou, fica em `cause`.

## Através de um worker

Um erro lançado dentro de um worker do `@fulcro/parallel` volta como texto: uma
thread não consegue entregar o próprio objeto de erro. O pool o cria de novo do
seu lado. Um erro da própria biblioteca volta com o seu código; um erro lançado
pela sua task volta como [FULCRO3005](./errors/FULCRO3xxx.md#fulcro3005), com a
sua mensagem mantida palavra por palavra.
