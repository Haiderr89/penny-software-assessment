import { LineItem } from '../models/cr.models';

export type DiffKind = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffRow {
	sku: string;
	kind: DiffKind;
	baseline?: LineItem;
	proposed?: LineItem;
}

/**
 * Compute the line-item diff shown in the preview panel: which SKUs were added, removed, changed,
 * or left unchanged between the baseline and the proposed line items.
 *
 * Heads-up: the change-detection here is not quite right — a line that changed is sometimes reported
 * as unchanged. `diff.spec.ts` surfaces the defect; the root cause lives in this file.
 */
/** Two line items are the same only when every reviewer-visible field matches. */
function sameItem(a: LineItem, b: LineItem): boolean {
	return a.quantity === b.quantity && a.unitPrice === b.unitPrice && a.description === b.description;
}

export function computeDiff(baseline: LineItem[], proposed: LineItem[]): DiffRow[] {
	const rows: DiffRow[] = [];
	const proposedBySku = new Map(proposed.map((p) => [p.sku, p]));
	const baselineBySku = new Map(baseline.map((b) => [b.sku, b]));

	for (const b of baseline) {
		const p = proposedBySku.get(b.sku);
		if (!p) {
			rows.push({ sku: b.sku, kind: 'removed', baseline: b });
			continue;
		}
		rows.push({ sku: b.sku, kind: sameItem(b, p) ? 'unchanged' : 'changed', baseline: b, proposed: p });
	}
	for (const p of proposed) {
		if (!baselineBySku.has(p.sku)) {
			rows.push({ sku: p.sku, kind: 'added', proposed: p });
		}
	}
	return rows;
}
