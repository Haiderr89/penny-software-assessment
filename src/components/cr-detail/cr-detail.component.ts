import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormControl, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { CrApiService } from '../../api/cr-api.service';
import { SessionService } from '../../session/session.service';
import { CrDetail, ReqUser, TimelineEntry } from '../../models/cr.models';
import { idle, loading, ViewState } from '../../common/view-state';
import { computeDiff, DiffRow } from '../diff.util';
import { canApprovePolicy } from '../../common/permissions';
import { formatMoney } from '../../common/money.util';

/**
 * Change Request DETAIL page: loads a CR and renders the diff/preview, the approval timeline, and
 * permission-aware Approve/Reject actions. `load`, the diff binding, and the template skeleton are
 * provided; the timeline ordering, permission gating, actions, and reject validation are yours.
 */
/** Valid only when the value contains non-whitespace text. */
function nonBlank(control: AbstractControl<string>): ValidationErrors | null {
	return control.value.trim().length ? null : { required: true };
}

@Component({
	selector: 'app-cr-detail',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule],
	templateUrl: './cr-detail.component.html',
})
export class CrDetailComponent implements OnInit {
	@Input() id!: string;

	state: ViewState<CrDetail> = idle();
	submitting = false;
	actionError?: string;
	rejectControl = new FormControl('', { nonNullable: true, validators: [nonBlank] });

	constructor(private readonly api: CrApiService, private readonly session: SessionService) {}

	ngOnInit(): void {
		void this.load();
	}

	async load(): Promise<void> {
		this.state = loading();
		this.actionError = undefined;
		try {
			const detail = await this.api.getChangeRequest(this.session.user, this.id);
			this.state = { status: 'loaded', data: detail };
		} catch (err) {
			this.state = { status: 'error', data: null, error: (err as Error).message };
		}
	}

	get detail(): CrDetail | null {
		return this.state.data;
	}

	get diff(): DiffRow[] {
		return this.detail ? computeDiff(this.detail.baselineLineItems, this.detail.proposedLineItems) : [];
	}

	/** Approval timeline, oldest-first. The audit array arrives in no guaranteed order. */
	get timeline(): TimelineEntry[] {
		return [...(this.detail?.audit ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
	}

	/** Whether the current user may approve the loaded CR: pending status AND an approve policy. */
	get canApprove(): boolean {
		return this.detail?.status === 'PENDING_APPROVAL' && canApprovePolicy(this.session.user);
	}

	/** Reject is part of the same approval decision, so it is gated by the same policy. */
	get canReject(): boolean {
		return this.detail?.status === 'PENDING_APPROVAL' && canApprovePolicy(this.session.user);
	}

	fmt(amount: number): string {
		return this.detail ? formatMoney(amount, this.detail.currency) : String(amount);
	}

	async approve(): Promise<void> {
		if (!this.canApprove || this.submitting) return;
		await this.runAction((user, id) => this.api.approve(user, id, new Date().toISOString()));
	}

	async reject(): Promise<void> {
		if (!this.canReject || this.submitting) return;
		if (this.rejectControl.invalid) {
			this.rejectControl.markAsTouched();
			return;
		}
		const reason = this.rejectControl.value.trim();
		const done = await this.runAction((user, id) => this.api.reject(user, id, new Date().toISOString(), reason));
		if (done) this.rejectControl.reset();
	}

	/**
	 * Shared action wrapper: one in-flight action at a time; on success the fresh CR replaces the
	 * view state, on failure the loaded CR stays on screen with the error alongside.
	 */
	private async runAction(call: (user: ReqUser, id: string) => Promise<CrDetail>): Promise<boolean> {
		this.submitting = true;
		this.actionError = undefined;
		try {
			const updated = await call(this.session.user, this.id);
			this.state = { status: 'loaded', data: updated };
			return true;
		} catch (err) {
			this.actionError = (err as Error).message;
			return false;
		} finally {
			this.submitting = false;
		}
	}
}
