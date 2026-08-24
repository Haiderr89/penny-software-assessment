import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrDetailComponent } from './cr-detail.component';
import { SessionService } from '../../session/session.service';
import { CrApiService } from '../../api/cr-api.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render(user: ReqUser, id: string): Promise<ComponentFixture<CrDetailComponent>> {
	TestBed.configureTestingModule({
		imports: [CrDetailComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrDetailComponent);
	fixture.componentInstance.id = id;
	fixture.detectChanges(); // ngOnInit -> load()
	await flush(); // let the mock API resolve
	fixture.detectChanges(); // render the loaded state
	return fixture;
}

describe('CrDetailComponent', () => {
	it('loads and renders the change request title', async () => {
		const fixture = await render(users.approver, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Add 1 unit of SKU-A');
	});

	it('disables Approve for a read-only viewer on a pending CR', async () => {
		const fixture = await render(users.viewer, 'CR-1'); // viewer: cr_r_o only; CR-1 is PENDING_APPROVAL
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(true);
	});
});

describe('CrDetailComponent — diff, timeline, actions', () => {
	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

	async function setup(user: ReqUser): Promise<CrApiService> {
		TestBed.configureTestingModule({
			imports: [CrDetailComponent],
			providers: [{ provide: SessionService, useValue: { user } }],
		});
		await TestBed.compileComponents();
		return TestBed.inject(CrApiService);
	}

	async function create(id: string): Promise<ComponentFixture<CrDetailComponent>> {
		const fixture = TestBed.createComponent(CrDetailComponent);
		fixture.componentInstance.id = id;
		fixture.detectChanges();
		await flush();
		fixture.detectChanges();
		return fixture;
	}

	const timelineActions = (el: HTMLElement): (string | null)[] =>
		Array.from(el.querySelectorAll('.cr-timeline__action')).map((n) => n.textContent);

	it('classifies the CR-1 line items: SKU-A changed, SKU-B unchanged', async () => {
		await setup(users.approver);
		const fixture = await create('CR-1');
		const rows = Array.from(fixture.nativeElement.querySelectorAll('.cr-diff__row')) as HTMLElement[];
		const kinds = rows.map((r) => [r.querySelector('td')?.textContent, r.getAttribute('data-kind')]);
		expect(kinds).toEqual([
			['SKU-A', 'changed'],
			['SKU-B', 'unchanged'],
		]);
	});

	it('renders totals and the delta', async () => {
		await setup(users.approver);
		const fixture = await create('CR-1');
		const totals = fixture.nativeElement.querySelector('.cr-detail__totals').textContent;
		expect(totals).toContain('USD 8,000.00 → USD 8,500.00');
		expect(totals).toContain('Δ USD 500.00');
	});

	it('renders the timeline chronologically, oldest first', async () => {
		await setup(users.approver);
		const fixture = await create('CR-1'); // fixture audit arrives newest-first
		expect(timelineActions(fixture.nativeElement)).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL']);
	});

	it('approve: updates the status, appends to the timeline, and retires the actions', async () => {
		await setup(users.approver);
		const fixture = await create('CR-1');
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(false);

		approveBtn.click();
		await flush();
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('.cr-status').textContent).toBe('APPROVED');
		expect(timelineActions(fixture.nativeElement)).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL', 'APPROVE']);
		expect(approveBtn.disabled).toBe(true); // no longer PENDING_APPROVAL
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
	});

	it('allows only one in-flight action on a slow network', async () => {
		const api = await setup(users.approver);
		const fixture = await create('CR-1');
		api.latencyMs = 20;

		fixture.nativeElement.querySelector('.cr-actions__approve').click();
		fixture.detectChanges();
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(true); // locked while submitting
		expect(fixture.nativeElement.querySelector('.cr-actions__busy')).not.toBeNull();

		await fixture.componentInstance.approve(); // second attempt is a guarded no-op
		await wait(40);
		fixture.detectChanges();

		const approvals = timelineActions(fixture.nativeElement).filter((a) => a === 'APPROVE');
		expect(approvals).toHaveLength(1);
	});

	it('keeps a coherent view when approve fails: error shown, CR still pending, actions re-enabled', async () => {
		const api = await setup(users.approver);
		const fixture = await create('CR-1');
		api.failNext = true;

		fixture.nativeElement.querySelector('.cr-actions__approve').click();
		await flush();
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('.cr-actions__error').textContent).toContain('Network error');
		expect(fixture.nativeElement.querySelector('.cr-status').textContent).toBe('PENDING_APPROVAL');
		expect((fixture.nativeElement.querySelector('.cr-actions__approve') as HTMLButtonElement).disabled).toBe(false);

		// and the next attempt succeeds
		fixture.nativeElement.querySelector('.cr-actions__approve').click();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-status').textContent).toBe('APPROVED');
		expect(fixture.nativeElement.querySelector('.cr-actions__error')).toBeNull();
	});

	it('blocks Reject until a non-blank reason is entered', async () => {
		await setup(users.approver);
		const fixture = await create('CR-1');
		const rejectBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__reject-btn');
		const reason: HTMLTextAreaElement = fixture.nativeElement.querySelector('.cr-actions__reason');

		expect(rejectBtn.disabled).toBe(true); // empty reason

		reason.value = '   ';
		reason.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(rejectBtn.disabled).toBe(true); // whitespace-only reason

		reason.dispatchEvent(new Event('blur'));
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-actions__reason-error')).not.toBeNull();

		await fixture.componentInstance.reject(); // guarded: no API call happens
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-status').textContent).toBe('PENDING_APPROVAL');
		expect(timelineActions(fixture.nativeElement)).not.toContain('REJECT');
	});

	it('reject with a reason: status REJECTED and the note appears in the timeline', async () => {
		await setup(users.approver);
		const fixture = await create('CR-1');
		const reason: HTMLTextAreaElement = fixture.nativeElement.querySelector('.cr-actions__reason');
		reason.value = 'Quantity increase is not budgeted';
		reason.dispatchEvent(new Event('input'));
		fixture.detectChanges();

		fixture.nativeElement.querySelector('.cr-actions__reject-btn').click();
		await flush();
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('.cr-status').textContent).toBe('REJECTED');
		expect(timelineActions(fixture.nativeElement)).toContain('REJECT');
		expect(fixture.nativeElement.querySelector('.cr-timeline__note').textContent).toBe('Quantity increase is not budgeted');
	});

	it('reloads when the id input changes, so actions always target the CR on screen', async () => {
		await setup(users.approver);
		const fixture = TestBed.createComponent(CrDetailComponent);
		fixture.componentRef.setInput('id', 'CR-1');
		fixture.detectChanges();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Add 1 unit of SKU-A');
		expect((fixture.nativeElement.querySelector('.cr-actions__approve') as HTMLButtonElement).disabled).toBe(false);

		fixture.componentRef.setInput('id', 'CR-3'); // a DRAFT
		fixture.detectChanges();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Extend agreement term');
		expect((fixture.nativeElement.querySelector('.cr-actions__approve') as HTMLButtonElement).disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
	});

	it('never enables Approve for a CR that is not pending approval', async () => {
		await setup(users.approver);
		const fixture = await create('CR-2'); // APPLIED
		expect((fixture.nativeElement.querySelector('.cr-actions__approve') as HTMLButtonElement).disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
	});

	it('emits `changed` on a successful action but not on a failed one', async () => {
		const api = await setup(users.approver);
		const fixture = await create('CR-1');
		const emitted: string[] = [];
		fixture.componentInstance.changed.subscribe((cr) => emitted.push(cr.status));

		api.failNext = true;
		fixture.nativeElement.querySelector('.cr-actions__approve').click();
		await flush();
		fixture.detectChanges();
		expect(emitted).toEqual([]);

		fixture.nativeElement.querySelector('.cr-actions__approve').click();
		await flush();
		fixture.detectChanges();
		expect(emitted).toEqual(['APPROVED']);
	});

	it('never offers the reject controls to a read-only viewer', async () => {
		await setup(users.viewer);
		const fixture = await create('CR-1');
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-timeline__list')).not.toBeNull(); // data still visible
	});

	it('renders the error state for a CR outside the user org', async () => {
		await setup(users.approver);
		const fixture = await create('CR-9'); // org-beta
		expect(fixture.nativeElement.querySelector('.cr-detail__error').textContent).toContain('Not found');
		expect(fixture.nativeElement.querySelector('.cr-detail__header')).toBeNull();
	});
});
