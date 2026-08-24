import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrListComponent } from './cr-list.component';
import { SessionService } from '../../session/session.service';
import { CrApiService } from '../../api/cr-api.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render(user: ReqUser): Promise<ComponentFixture<CrListComponent>> {
	TestBed.configureTestingModule({
		imports: [CrListComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrListComponent);
	fixture.detectChanges(); // ngOnInit -> load()
	await flush(); // let the mock API resolve
	fixture.detectChanges(); // render the loaded/empty state
	return fixture;
}

describe('CrListComponent', () => {
	it('renders a row per change request in the user org', async () => {
		const fixture = await render(users.approver);
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(3); // org-alpha: CR-1, CR-2, CR-3
	});

	it('shows the empty state when the org has no change requests', async () => {
		const fixture = await render({ id: 'x', orgCode: 'org-empty', policies: ['cr_r_o'] });
		expect(fixture.nativeElement.querySelector('.cr-list__empty')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();
	});
});

describe('CrListComponent — states and filter', () => {
	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

	async function setup(user: ReqUser): Promise<CrApiService> {
		TestBed.configureTestingModule({
			imports: [CrListComponent],
			providers: [{ provide: SessionService, useValue: { user } }],
		});
		await TestBed.compileComponents();
		return TestBed.inject(CrApiService);
	}

	it('shows the loading state while the request is in flight', async () => {
		const api = await setup(users.approver);
		api.latencyMs = 20;
		const fixture = TestBed.createComponent(CrListComponent);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__loading')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();
		await wait(40);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__loading')).toBeNull();
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(3);
	});

	it('shows the error state on failure, and Retry recovers', async () => {
		const api = await setup(users.approver);
		api.failNext = true;
		const fixture = TestBed.createComponent(CrListComponent);
		fixture.detectChanges();
		await flush();
		fixture.detectChanges();
		const error = fixture.nativeElement.querySelector('.cr-list__error');
		expect(error).not.toBeNull();
		expect(error.textContent).toContain('Network error');

		(error.querySelector('button') as HTMLButtonElement).click();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__loading')).not.toBeNull();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__error')).toBeNull();
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(3);
	});

	it('narrows the rendered rows by the selected status, and ALL restores them', async () => {
		await setup(users.approver);
		const fixture = TestBed.createComponent(CrListComponent);
		fixture.detectChanges();
		await flush();
		fixture.detectChanges();

		const select: HTMLSelectElement = fixture.nativeElement.querySelector('.cr-list__filter');
		select.value = 'PENDING_APPROVAL';
		select.dispatchEvent(new Event('change'));
		fixture.detectChanges();
		const ids = Array.from(fixture.nativeElement.querySelectorAll('.cr-list__row td:first-child')).map(
			(td) => (td as HTMLElement).textContent,
		);
		expect(ids).toEqual(['CR-1']);

		select.value = 'ALL';
		select.dispatchEvent(new Event('change'));
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(3);
	});

	it('renders zero rows when the filter matches nothing', async () => {
		await setup(users.approver);
		const fixture = TestBed.createComponent(CrListComponent);
		fixture.detectChanges();
		await flush();
		fixture.detectChanges();

		const select: HTMLSelectElement = fixture.nativeElement.querySelector('.cr-list__filter');
		select.value = 'REJECTED';
		select.dispatchEvent(new Event('change'));
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(0);
		expect(fixture.nativeElement.querySelector('.cr-list__table')).not.toBeNull();
	});
});
