import { Decimal } from '@fulcro/types';

// Operators on Decimal, which the checker would refuse outright without the
// rewrite: every line below is a type error to plain `tsc`.

const price = Decimal.from('19.99');
const three = Decimal.from(3);

export const arithmetic = [
	price * three,
	price + Decimal.from('0.01'),
	price - price,
	Decimal.from(1) / three,
	Decimal.from('7.5') % Decimal.from(2),
	Decimal.from('1.1') ** Decimal.from(2),
	Decimal.from(2) ** Decimal.from(-2),
	-price,
	+price,
].map((value) => value.toString());

export const comparisons = [
	price > three,
	price <= price,
	Decimal.from('0.1') + Decimal.from('0.2') === Decimal.from('0.3'),
	Decimal.from('1.20') == Decimal.from('1.2'),
	Decimal.from(0) === Decimal.from('-0'),
	Decimal.from('NaN') !== Decimal.from('NaN'),
];

let total = Decimal.from(0);

total += price;
total *= three;
total++;
export const accumulated = total.toString();

let counter = Decimal.from('1.5');
export const postfix = (counter--).toString();
export const afterPostfix = counter.toString();

export const concatenated = ['total: ' + price, price + ' each'];

const maybe: Decimal | null = null;
export const identity = [maybe === null, maybe !== null];

// A chain across declarations, resolved by the fixed point.
const subtotal = price * three;
const tax = subtotal * Decimal.from('0.1');
export const withTax = (subtotal + tax).toString();
