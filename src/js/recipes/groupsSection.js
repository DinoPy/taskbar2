let ctx = null;
let container = null;

export function init(sharedCtx) { ctx = sharedCtx; }
export function render(ct) {
	container = ct;
	container.innerHTML = '<div class="rcp-empty-state">Coming soon</div>';
}
export function onEvent(event, data) {}
export function destroy() { container = null; }
