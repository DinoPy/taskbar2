export function resolveSingleReference(selectedId, collection) {
	if (!selectedId) {
		return {
			value: "",
			entity: null,
			isStale: false,
		};
	}

	const entity = collection instanceof Map ? (collection.get(selectedId) ?? null) : null;

	return {
		value: selectedId,
		entity,
		isStale: !entity,
	};
}

export function resolveMultiReference(selectedIds, collection) {
	const ids = Array.isArray(selectedIds)
		? selectedIds.filter(id => typeof id === "string" && id)
		: [];

	const validIds = [];
	const staleIds = [];

	for (const id of ids) {
		if (collection instanceof Map && collection.has(id)) validIds.push(id);
		else staleIds.push(id);
	}

	return {
		selectedIds: ids,
		validIds,
		staleIds,
		hasStale: staleIds.length > 0,
	};
}
