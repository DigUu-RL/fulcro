// A file with no numeric type of this package in it. The rewrite must leave it
// exactly as written: a consumer's own arithmetic is none of its business.

const width = 10;
const height = 20;
let area = width * height;

area += 1;
area++;

const ids = [1n, 2n].map((id) => id * 2n);
const label = 'area: ' + area;

export const results = { area, ids, label, flag: width < height };
