/**
 * ListsController — manages list surfaces, subscriptions, and runtime state.
 *
 * A "surface" is keyed by "kind:id" (e.g. "task:abc-123") and stores the full
 * ListsTargetPayload returned by the server.  Windows subscribe to surfaces so
 * they receive push updates whenever the payload changes.
 */

const surfaceKey = (target) => {
	if (!target?.kind) return null;
	if (target.kind === "standalone_home") return "standalone_home";
	if (!target.id) return null;
	return `${target.kind}:${target.id}`;
};

const parsePayload = (data) => {
	if (!data) return null;
	if (typeof data === "string") {
		try {
			return JSON.parse(data);
		} catch {
			return null;
		}
	}
	return typeof data === "object" ? data : null;
};

export function createListsController({ sendEvent, log = console.log, onTaskListStatus, onTemplateSurfaceUpdated }) {
	/** Map<surfaceKey, ListsTargetPayload> */
	const surfaces = new Map();

	/** Map<surfaceKey, Map<windowId, windowRef>> */
	const surfaceSubscribers = new Map();

	/** Map<windowId, Set<surfaceKey>> */
	const windowSubscriptions = new Map();

	/** Map<run_id, surfaceKey> — O(1) lookup for runtime events */
	const runIndex = new Map();

	// ---------------------------------------------------------------
	// Internal helpers
	// ---------------------------------------------------------------

	const pushToSubscribers = (key, payload) => {
		const subs = surfaceSubscribers.get(key);
		if (!subs) return;
		for (const [, ref] of subs) {
			try {
				ref._pushFn("lists-data", payload);
			} catch (err) {
				log(`[ListsController] pushToSubscribers error for window ${ref._id}: ${err}`);
			}
		}
	};

	const rebuildRunIndex = (key, payload) => {
		// Remove stale entries that point to this surface
		for (const [runId, sk] of runIndex) {
			if (sk === key) runIndex.delete(runId);
		}
		// Re-index
		const lists = payload?.lists;
		if (!Array.isArray(lists)) return;
		for (const bundle of lists) {
			if (bundle?.run?.id) {
				runIndex.set(bundle.run.id, key);
			}
		}
	};

	const storeSurface = (key, payload) => {
		surfaces.set(key, payload);
		rebuildRunIndex(key, payload);
		notifyTaskListStatus(key, payload);
	};

	const notifyTaskListStatus = (key, payload) => {
		if (!onTaskListStatus) return;
		// Only notify for task surfaces
		const target = payload?.target;
		if (!target || target.kind !== "task") return;

		let totalRequired = 0;
		let totalCompleted = 0;
		const lists = payload?.lists;
		if (Array.isArray(lists)) {
			for (const bundle of lists) {
				if (!bundle?.run) continue;
				totalRequired += bundle.run.required_total ?? 0;
				totalCompleted += bundle.run.required_completed ?? 0;
			}
		}
		onTaskListStatus({
			taskId: target.id,
			incompleteCount: Math.max(0, totalRequired - totalCompleted),
			totalRequired,
			listCount: Array.isArray(lists) ? lists.length : 0,
		});
	};

	const removeSurface = (key) => {
		// Clean run index entries for this surface
		for (const [runId, sk] of runIndex) {
			if (sk === key) runIndex.delete(runId);
		}
		surfaces.delete(key);
		surfaceSubscribers.delete(key);
	};

	// ---------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------

	const subscribe = (target, windowRef) => {
		const key = surfaceKey(target);
		if (!key || !windowRef?._id) return;

		// Register subscriber
		if (!surfaceSubscribers.has(key)) {
			surfaceSubscribers.set(key, new Map());
		}
		surfaceSubscribers.get(key).set(windowRef._id, windowRef);

		// Track which surfaces this window subscribes to
		if (!windowSubscriptions.has(windowRef._id)) {
			windowSubscriptions.set(windowRef._id, new Set());
		}
		windowSubscriptions.get(windowRef._id).add(key);

		// Push existing data if available
		const existing = surfaces.get(key);
		if (existing) {
			try {
				windowRef._pushFn("lists-data", existing);
			} catch (err) {
				log(`[ListsController] subscribe push error for window ${windowRef._id}: ${err}`);
			}
		}
	};

	const unsubscribe = (windowRef) => {
		if (!windowRef?._id) return;
		const keys = windowSubscriptions.get(windowRef._id);
		if (!keys) return;

		for (const key of keys) {
			const subs = surfaceSubscribers.get(key);
			if (subs) {
				subs.delete(windowRef._id);
				// Remove surface if no subscribers left
				if (subs.size === 0) {
					removeSurface(key);
				}
			}
		}
		windowSubscriptions.delete(windowRef._id);
	};

	const fetchForTarget = (target, windowRef) => {
		subscribe(target, windowRef);
		sendEvent?.("lists_fetch", { target });
	};

	const sendMutation = (event, data) => {
		const payload = {
			...data,
			last_modified_at: data?.last_modified_at ?? Date.now(),
		};
		sendEvent?.(event, payload);
	};

	const handleListsTarget = (rawPayload) => {
		const payload = parsePayload(rawPayload);
		if (!payload?.target) return;
		const key = surfaceKey(payload.target);
		if (!key) return;

		storeSurface(key, payload);
		pushToSubscribers(key, payload);

		if (payload.target.kind === "task_template") {
			onTemplateSurfaceUpdated?.(payload.target);
		}
	};

	const handleTemplateMutation = (rawPayload) => {
		// Template mutations return full ListsTargetPayload, same as handleListsTarget
		handleListsTarget(rawPayload);
	};

	const handleRunItemUpdated = (rawRunItem) => {
		const runItem = parsePayload(rawRunItem);
		if (!runItem?.run_id) return;

		const key = runIndex.get(runItem.run_id);
		if (!key) return;

		const surface = surfaces.get(key);
		if (!surface?.lists) return;

		// Patch run_item in-place
		let patched = false;
		for (const bundle of surface.lists) {
			if (bundle?.run?.id !== runItem.run_id) continue;
			if (!Array.isArray(bundle.run_items)) continue;
			const idx = bundle.run_items.findIndex((ri) => ri.id === runItem.id);
			if (idx >= 0) {
				bundle.run_items[idx] = runItem;
				patched = true;
				break;
			}
		}

		if (patched) {
			pushToSubscribers(key, surface);
		}
	};

	const handleRunUpdated = (rawRun) => {
		const run = parsePayload(rawRun);
		if (!run?.id) return;

		const key = runIndex.get(run.id);
		if (!key) return;

		const surface = surfaces.get(key);
		if (!surface?.lists) return;

		// Patch run in-place
		let patched = false;
		for (const bundle of surface.lists) {
			if (bundle?.run?.id !== run.id) continue;
			bundle.run = run;
			patched = true;
			break;
		}

		if (patched) {
			pushToSubscribers(key, surface);
		}
	};

	const handleStandaloneListAttached = (payload) => {
		log(`[ListsController] standalone_list_attached: source=${payload?.source?.list_id}, dest=${payload?.destination?.target?.kind}:${payload?.destination?.target?.id}`);
		// Notify standalone_home subscribers about the successful attach
		const key = "standalone_home";
		const subs = surfaceSubscribers.get(key);
		if (subs) {
			for (const [, ref] of subs) {
				try {
					ref._pushFn("lists-attach-success", payload);
				} catch (err) {
					log(`[ListsController] attach notify error: ${err}`);
				}
			}
		}
	};

	const handleShareCreated = (payload) => {
		// Share created — refetch standalone_home to pick up newly shared list
		refetchAllActive();
		// Forward to all subscribers for UI update
		for (const [, subs] of surfaceSubscribers) {
			for (const [, ref] of subs) {
				try {
					ref._pushFn("lists-share-created", payload);
				} catch (err) {
					log(`[ListsController] handleShareCreated push error: ${err}`);
				}
			}
		}
	};

	const handleShareRemoved = (payload) => {
		// Share removed — refetch standalone_home
		refetchAllActive();
		// Forward to subscribers
		for (const [, subs] of surfaceSubscribers) {
			for (const [, ref] of subs) {
				try {
					ref._pushFn("lists-share-removed", payload);
				} catch (err) {
					log(`[ListsController] handleShareRemoved push error: ${err}`);
				}
			}
		}
	};

	const handleSharesList = (payload) => {
		// Forward shares list to all subscribers
		for (const [, subs] of surfaceSubscribers) {
			for (const [, ref] of subs) {
				try {
					ref._pushFn("lists-shares-list", payload);
				} catch (err) {
					log(`[ListsController] handleSharesList push error: ${err}`);
				}
			}
		}
	};

	const handleRunItemAssigned = (payload) => {
		for (const [, subs] of surfaceSubscribers) {
			for (const [, ref] of subs) {
				try {
					ref._pushFn("lists-run-item-assigned", payload);
				} catch (err) {
					log(`[ListsController] handleRunItemAssigned push error: ${err}`);
				}
			}
		}
	};

	const handleRunItemUnassigned = (payload) => {
		for (const [, subs] of surfaceSubscribers) {
			for (const [, ref] of subs) {
				try {
					ref._pushFn("lists-run-item-unassigned", payload);
				} catch (err) {
					log(`[ListsController] handleRunItemUnassigned push error: ${err}`);
				}
			}
		}
	};

	const handleListError = (errorPayload) => {
		// Push error to all subscribers across all surfaces
		for (const [key] of surfaceSubscribers) {
			const subs = surfaceSubscribers.get(key);
			if (!subs) continue;
			for (const [, ref] of subs) {
				try {
					ref._pushFn("lists-error", errorPayload);
				} catch (err) {
					log(`[ListsController] handleListError push error for window ${ref._id}: ${err}`);
				}
			}
		}
	};

	const refetchAllActive = () => {
		const fetched = new Set();
		for (const [key, subs] of surfaceSubscribers) {
			if (subs.size === 0) continue;
			if (fetched.has(key)) continue;
			fetched.add(key);

			if (key === "standalone_home") {
				sendEvent?.("lists_fetch", { target: { kind: "standalone_home" } });
			} else {
				const colonIdx = key.indexOf(":");
				if (colonIdx > 0) {
					const kind = key.substring(0, colonIdx);
					const id = key.substring(colonIdx + 1);
					sendEvent?.("lists_fetch", { target: { kind, id } });
				}
			}
		}
	};

	const getSurface = (target) => {
		const key = surfaceKey(target);
		if (!key) return null;
		return surfaces.get(key) ?? null;
	};

	return {
		subscribe,
		unsubscribe,
		fetchForTarget,
		sendMutation,
		handleListsTarget,
		handleTemplateMutation,
		handleRunItemUpdated,
		handleRunUpdated,
		handleStandaloneListAttached,
		handleShareCreated,
		handleShareRemoved,
		handleSharesList,
		handleRunItemAssigned,
		handleRunItemUnassigned,
		handleListError,
		refetchAllActive,
		getSurface,
	};
}
