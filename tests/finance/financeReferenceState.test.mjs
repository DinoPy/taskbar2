import test from "node:test";
import assert from "node:assert/strict";

import {
	resolveSingleReference,
	resolveMultiReference,
} from "../../src/js/finance/financeReferenceState.js";

test("resolveSingleReference returns a non-stale result for a present id", () => {
	const collection = new Map([["acct-1", { id: "acct-1", name: "Main" }]]);

	const result = resolveSingleReference("acct-1", collection);

	assert.equal(result.value, "acct-1");
	assert.equal(result.entity?.id, "acct-1");
	assert.equal(result.isStale, false);
});

test("resolveSingleReference marks a missing id as stale", () => {
	const result = resolveSingleReference("acct-missing", new Map());

	assert.equal(result.value, "acct-missing");
	assert.equal(result.entity, null);
	assert.equal(result.isStale, true);
});

test("resolveMultiReference keeps valid ids and reports stale ids separately", () => {
	const collection = new Map([["acct-1", { id: "acct-1" }]]);

	const result = resolveMultiReference(["acct-1", "acct-missing"], collection);

	assert.deepEqual(result.selectedIds, ["acct-1", "acct-missing"]);
	assert.deepEqual(result.validIds, ["acct-1"]);
	assert.deepEqual(result.staleIds, ["acct-missing"]);
	assert.equal(result.hasStale, true);
});
