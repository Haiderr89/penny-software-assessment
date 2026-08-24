import { computeDiff } from './diff.util';
import { LineItem } from '../models/cr.models';

const base: LineItem[] = [
	{ sku: 'SKU-A', description: 'Widget A', quantity: 10, unitPrice: 500 },
	{ sku: 'SKU-B', description: 'Widget B', quantity: 30, unitPrice: 100 },
];

describe('computeDiff', () => {
	it('detects a removed sku', () => {
		expect(computeDiff(base, [base[0]]).find((r) => r.sku === 'SKU-B')?.kind).toBe('removed');
	});

	it('detects an added sku', () => {
		const rows = computeDiff(base, [...base, { sku: 'SKU-C', description: 'C', quantity: 1, unitPrice: 5 }]);
		expect(rows.find((r) => r.sku === 'SKU-C')?.kind).toBe('added');
	});

	it('detects a quantity-only change as changed', () => {
		// SKU-A quantity 10 -> 11 (same unit price) is a real change.
		const rows = computeDiff(base, [{ ...base[0], quantity: 11 }, base[1]]);
		expect(rows.find((r) => r.sku === 'SKU-A')?.kind).toBe('changed');
	});
});

describe('computeDiff — change classification', () => {
	it('detects a price-only change as changed', () => {
		const rows = computeDiff(base, [{ ...base[0], unitPrice: 550 }, base[1]]);
		expect(rows.find((r) => r.sku === 'SKU-A')?.kind).toBe('changed');
	});

	it('detects a description-only change as changed', () => {
		const rows = computeDiff(base, [base[0], { ...base[1], description: 'Widget B (new supplier)' }]);
		expect(rows.find((r) => r.sku === 'SKU-B')?.kind).toBe('changed');
	});

	it('reports identical items as unchanged', () => {
		const rows = computeDiff(base, [...base]);
		expect(rows.map((r) => r.kind)).toEqual(['unchanged', 'unchanged']);
	});

	it('carries both sides on a changed row so the template can render before/after', () => {
		const proposed = { ...base[0], quantity: 11 };
		const row = computeDiff(base, [proposed, base[1]]).find((r) => r.sku === 'SKU-A');
		expect(row?.baseline).toEqual(base[0]);
		expect(row?.proposed).toEqual(proposed);
	});
});
