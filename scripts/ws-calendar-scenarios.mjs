#!/usr/bin/env node

import crypto from "node:crypto";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";

const WS_URL = process.env.TASKBAR_WS_URL ?? "ws://127.0.0.1:8080/ws/taskbar";
const CONNECT_TIMEOUT_MS = Number(process.env.TASKBAR_WS_CONNECT_TIMEOUT_MS ?? 15000);
const EVENT_TIMEOUT_MS = Number(process.env.TASKBAR_WS_EVENT_TIMEOUT_MS ?? 15000);

const TEST_EMAIL =
	process.env.TASKBAR_TEST_EMAIL ?? `calendar-ws-${Date.now()}@example.com`;
const TEST_GOOGLE_UID =
	process.env.TASKBAR_TEST_GOOGLE_UID ?? `calendar-ws-${crypto.randomUUID()}`;

function log(message, extra = null) {
	const prefix = "[ws-calendar-scenarios]";
	if (extra === null || extra === undefined) {
		console.log(`${prefix} ${message}`);
		return;
	}
	console.log(`${prefix} ${message}`, extra);
}

function fail(message, context = null) {
	log(`FAIL: ${message}`, context);
	process.exitCode = 1;
	throw new Error(message);
}

class WSScenarioClient {
	constructor(url) {
		this.url = url;
		this.ws = null;
		this.events = [];
		this.connected = false;
		this.connectionErrors = [];
	}

	async connect() {
		await new Promise((resolve, reject) => {
			const ws = new WebSocket(this.url);
			this.ws = ws;

			const timer = setTimeout(() => {
				reject(new Error(`connect timeout after ${CONNECT_TIMEOUT_MS}ms`));
			}, CONNECT_TIMEOUT_MS);

			ws.on("open", () => {
				clearTimeout(timer);
				resolve();
			});
			ws.on("error", (error) => {
				clearTimeout(timer);
				reject(error);
			});
			ws.on("close", (code, reason) => {
				this.connected = false;
				log(`socket closed code=${code} reason=${String(reason)}`);
			});
			ws.on("message", (raw) => {
				let parsed = null;
				try {
					parsed = JSON.parse(String(raw));
				} catch {
					return;
				}
				this.events.push(parsed);
				if (parsed?.event === "connected") {
					this.connected = true;
				}
				if (parsed?.event === "connection_error") {
					this.connectionErrors.push(parsed);
					log("connection_error received", parsed);
				}
			});
		});
	}

	send(event, data) {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("websocket is not open");
		}
		const envelope = JSON.stringify({ event, data });
		this.ws.send(envelope);
		log(`sent ${event}`);
	}

	async waitForEvent(eventName, predicate = () => true, timeoutMs = EVENT_TIMEOUT_MS) {
		const startedAt = Date.now();
		for (;;) {
			if (this.connectionErrors.length > 0 && eventName !== "connection_error") {
				const first = this.connectionErrors.shift();
				const message = first?.data?.message ?? first?.data ?? "unknown connection_error";
				throw new Error(`connection_error: ${message}`);
			}

			for (let i = 0; i < this.events.length; i += 1) {
				const message = this.events[i];
				if (message?.event !== eventName) {
					continue;
				}
				const payload = message?.data ?? {};
				if (!predicate(payload, message)) {
					continue;
				}
				this.events.splice(i, 1);
				log(`received ${eventName}`);
				return message;
			}

			if (Date.now() - startedAt > timeoutMs) {
				throw new Error(`timeout waiting for ${eventName} (${timeoutMs}ms)`);
			}
			await delay(50);
		}
	}

	async close() {
		if (!this.ws) return;
		try {
			this.ws.close();
		} catch {
			// no-op
		}
	}
}

function buildByHourRange(startHour, endHour) {
	const values = [];
	for (let hour = startHour; hour <= endHour; hour += 1) {
		values.push(hour);
	}
	return values.join(",");
}

function toRFC3339(ts) {
	return new Date(ts).toISOString();
}

function sameInstant(left, right) {
	const leftTs = Date.parse(String(left ?? ""));
	const rightTs = Date.parse(String(right ?? ""));
	if (Number.isNaN(leftTs) || Number.isNaN(rightTs)) {
		return false;
	}
	return leftTs === rightTs;
}

async function run() {
	const client = new WSScenarioClient(WS_URL);
	const cleanupScheduleIDs = [];
	try {
		log(`connecting to ${WS_URL}`);
		await client.connect();

		client.send("connect", {
			email: TEST_EMAIL,
			first_name: "Calendar",
			last_name: "WS Runner",
			google_uid: TEST_GOOGLE_UID,
		});
		await client.waitForEvent("connected");

		const now = new Date();
		const start = new Date(now.getTime() + 6 * 60 * 60 * 1000);
		start.setUTCSeconds(0, 0);
		const byHours = buildByHourRange(7, 21);
		client.send("schedule_create", {
			kind: "task",
			title: "WS Scenario - Minutely 30",
			tz: "UTC",
			start_local: toRFC3339(start),
			rrule: `FREQ=MINUTELY;INTERVAL=30;BYHOUR=${byHours};BYSECOND=0`,
			show_before_minutes: 0,
			notify_offsets_min: [],
			muted_offsets_min: [],
			category: "QA",
			common_language: "Scenario runner",
			urgency: "normal",
			is_all_day: false,
			all_day_span_days: 1,
			duration_minutes: 0,
		});

		const created = await client.waitForEvent("schedule_created");
		const schedule = created?.data ?? {};
		const scheduleID = schedule?.id;
		if (!scheduleID) {
			fail("schedule_created missing id", created);
		}
		cleanupScheduleIDs.push(scheduleID);

		const anchorOccursAt = schedule?.start_local;
		if (!anchorOccursAt || Number.isNaN(Date.parse(anchorOccursAt))) {
			fail("schedule_created missing valid start_local", created);
		}

		// Force materialization of an anchor occurrence even when background planner tick is delayed.
		client.send("occurrence_edit", {
			schedule_id: scheduleID,
			anchor_occurs_at: anchorOccursAt,
			changes: {
				title: "WS Scenario - Anchor",
			},
			apply_scope: "single",
			include_customized: false,
		});
		const anchorUpdated = await client.waitForEvent("occurrence_updated");
		const anchor = anchorUpdated?.data ?? {};
		if (!anchor?.occurs_at) {
			fail("occurrence_updated did not return anchor occurrence", anchorUpdated);
		}

		const fetchStart = new Date(start.getTime() - 2 * 60 * 60 * 1000);
		const fetchEnd = new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000);

		const anchorTs = Date.parse(anchor.occurs_at);
		if (Number.isNaN(anchorTs)) {
			fail("anchor occurs_at is invalid", anchor);
		}
		const shiftedTs = anchorTs - 60 * 60 * 1000;
		const expectedSourceRev = Number(schedule?.rev ?? 0);

		client.send("occurrence_edit", {
			schedule_id: scheduleID,
			anchor_occurs_at: anchor.occurs_at,
			changes: {
				occurs_at: toRFC3339(shiftedTs),
			},
			apply_scope: "following",
			include_customized: false,
			expected_source_rev: Number.isFinite(expectedSourceRev) ? expectedSourceRev : undefined,
		});

		const updatedOldSchedule = await client.waitForEvent("schedule_updated", (payload) => payload?.id === scheduleID);
		const createdSplitSchedule = await client.waitForEvent("schedule_created", (payload) => payload?.id !== scheduleID);
		const splitEvent = await client.waitForEvent(
			"occurrence_series_updated",
			(payload) => payload?.apply_scope === "following" && payload?.old_schedule_id === scheduleID,
		);

		const newScheduleID =
			splitEvent?.data?.new_schedule_id ??
			createdSplitSchedule?.data?.id;
		if (!newScheduleID) {
			fail("following edit did not return new schedule id", {
				splitEvent,
				createdSplitSchedule,
			});
		}
		cleanupScheduleIDs.push(newScheduleID);

		client.send("occurrences_fetch", {
			start: toRFC3339(fetchStart),
			end: toRFC3339(fetchEnd),
		});
		const secondList = await client.waitForEvent("occurrences_list");
		const secondRows = Array.isArray(secondList?.data?.occurrences) ? secondList.data.occurrences : [];

		const oldAnchorStillPlanned = secondRows.some(
			(row) =>
				row?.state === "planned" &&
				sameInstant(row?.occurs_at, anchor?.occurs_at) &&
				row?.schedule_id === scheduleID,
		);
		if (oldAnchorStillPlanned) {
			fail("old anchor remains planned after following split", {
				scheduleID,
				anchor: anchor.occurs_at,
			});
		}

		const shiftedAnchor = secondRows.find(
			(row) =>
				row?.schedule_id === newScheduleID &&
				row?.state === "planned" &&
				sameInstant(row?.occurs_at, toRFC3339(shiftedTs)),
		);
		if (!shiftedAnchor) {
			fail("shifted anchor not found on new split schedule", {
				newScheduleID,
				expectedOccursAt: toRFC3339(shiftedTs),
			});
		}

		client.send("occurrence_cancel", {
			schedule_id: newScheduleID,
			anchor_occurs_at: shiftedAnchor.occurs_at,
			apply_scope: "single",
			include_customized: false,
		});
		const canceledEvent = await client.waitForEvent("occurrence_canceled");
		const canceledOccurrenceID = canceledEvent?.data?.occurrence_id;
		if (!canceledOccurrenceID) {
			fail("occurrence_canceled missing occurrence_id", canceledEvent);
		}

		client.send("occurrence_delete", {
			occurrence_id: canceledOccurrenceID,
			apply_scope: "single",
			include_customized: false,
		});
		await client.waitForEvent("occurrence_deleted");

		log("scenario checks passed");
	} finally {
		for (const scheduleID of cleanupScheduleIDs) {
			try {
				client.send("schedule_delete", {
					id: scheduleID,
					delete_mode: "schedule_only",
				});
				await client.waitForEvent("schedule_deleted", (payload) => payload?.id === scheduleID);
			} catch (error) {
				log(`cleanup warning for schedule ${scheduleID}: ${error.message}`);
			}
		}
		await client.close();
	}
}

run().catch((error) => {
	log(`fatal: ${error.message}`);
	process.exitCode = 1;
});
