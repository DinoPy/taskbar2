// =========================================
// Currency / amount helpers
// =========================================

export function centsToDisplay(cents) {
	const negative = cents < 0;
	const abs = Math.abs(cents);
	const whole = Math.floor(abs / 100);
	const frac = String(abs % 100).padStart(2, "0");
	const formatted = whole.toLocaleString("en-US") + "." + frac;
	return negative ? "-" + formatted : formatted;
}

export function displayToCents(str) {
	const cleaned = String(str).replace(/[^0-9.\-]/g, "");
	const negative = cleaned.startsWith("-");
	const abs = cleaned.replace("-", "");
	const parts = abs.split(".");
	const whole = parseInt(parts[0] || "0", 10);
	const frac = parts.length > 1 ? parts[1].padEnd(2, "0").slice(0, 2) : "00";
	const cents = whole * 100 + parseInt(frac, 10);
	return negative ? -cents : cents;
}

export function formatCurrency(cents, currency = "RON") {
	return centsToDisplay(cents) + " " + currency;
}

// =========================================
// Date helpers
// =========================================

const MONTHS_SHORT = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDate(rfc3339) {
	const d = new Date(rfc3339);
	return MONTHS_SHORT[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
}

export function formatDateShort(rfc3339) {
	const d = new Date(rfc3339);
	return MONTHS_SHORT[d.getMonth()] + " " + d.getDate();
}

export function formatDateISO(date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return y + "-" + m + "-" + d + "T00:00:00Z";
}

export function getMonthRange(year, month) {
	const dateFrom = year + "-" + String(month).padStart(2, "0") + "-01T00:00:00Z";
	const lastDay = new Date(year, month, 0).getDate();
	const dateTo = year + "-" + String(month).padStart(2, "0") + "-" + String(lastDay).padStart(2, "0") + "T23:59:59Z";
	return { dateFrom, dateTo };
}

export function getCurrentMonthRange() {
	const now = new Date();
	return getMonthRange(now.getFullYear(), now.getMonth() + 1);
}

export function relativeDays(dateStr) {
	const target = new Date(dateStr);
	const now = new Date();
	target.setHours(0, 0, 0, 0);
	now.setHours(0, 0, 0, 0);
	const diffMs = target.getTime() - now.getTime();
	const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
	if (days === 0) return "today";
	if (days === 1) return "tomorrow";
	if (days === -1) return "yesterday";
	if (days > 0) return "in " + days + " days";
	return Math.abs(days) + " days ago";
}

// =========================================
// DOM helper
// =========================================

export function el(tag, attrs, ...children) {
	const elem = document.createElement(tag);
	if (attrs) {
		for (const [key, value] of Object.entries(attrs)) {
			if (value == null) continue;
			if (key === "class" || key === "className") {
				elem.className = value;
			} else if (key === "style" && typeof value === "object") {
				Object.assign(elem.style, value);
			} else if (key.startsWith("on") && typeof value === "function") {
				elem.addEventListener(key.slice(2).toLowerCase(), value);
			} else if (key === "checked" || key === "selected" || key === "disabled" || key === "readOnly") {
				elem[key] = value;
			} else {
				elem.setAttribute(key, value);
			}
		}
	}
	for (const child of children) {
		if (child == null) continue;
		if (typeof child === "string" || typeof child === "number") {
			elem.appendChild(document.createTextNode(String(child)));
		} else if (child instanceof Node) {
			elem.appendChild(child);
		}
	}
	return elem;
}

// =========================================
// SVG chart helpers
// =========================================

const ACCENT_COLOR = "oklch(0.72 0.17 165)";
const TEXT_COLOR = "oklch(0.65 0.02 260)";
const GRID_COLOR = "oklch(0.35 0.01 260)";
const AXIS_COLOR = "oklch(0.45 0.01 260)";

function escapeXml(str) {
	return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function niceScale(maxVal, ticks = 5) {
	if (maxVal <= 0) return { step: 1, max: ticks };
	const rough = maxVal / ticks;
	const mag = Math.pow(10, Math.floor(Math.log10(rough)));
	const residual = rough / mag;
	let nice;
	if (residual <= 1.5) nice = 1;
	else if (residual <= 3) nice = 2;
	else if (residual <= 7) nice = 5;
	else nice = 10;
	const step = nice * mag;
	const max = Math.ceil(maxVal / step) * step;
	return { step, max };
}

export function buildBarChart({ data, width = 400, height = 250, labelKey = "label", valueKey = "value", colorFn }) {
	if (!data || data.length === 0) return `<svg width="${width}" height="${height}"></svg>`;

	const pad = { top: 20, right: 20, bottom: 60, left: 60 };
	const plotW = width - pad.left - pad.right;
	const plotH = height - pad.top - pad.bottom;
	const maxVal = Math.max(...data.map(d => Math.abs(d[valueKey] || 0)));
	const { step, max } = niceScale(maxVal);
	const barW = Math.max(4, (plotW / data.length) * 0.7);
	const gap = (plotW / data.length) - barW;

	let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

	// Gridlines and Y-axis labels
	for (let v = 0; v <= max; v += step) {
		const y = pad.top + plotH - (v / max) * plotH;
		svg += `<line x1="${pad.left}" y1="${y}" x2="${pad.left + plotW}" y2="${y}" stroke="${GRID_COLOR}" stroke-width="0.5" stroke-dasharray="3,3"/>`;
		svg += `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" fill="${TEXT_COLOR}" font-size="10">${escapeXml(v.toLocaleString())}</text>`;
	}

	// Bars and X-axis labels
	data.forEach((d, i) => {
		const x = pad.left + i * (barW + gap) + gap / 2;
		const val = Math.abs(d[valueKey] || 0);
		const barH = max > 0 ? (val / max) * plotH : 0;
		const y = pad.top + plotH - barH;
		const fill = colorFn ? colorFn(d, i) : ACCENT_COLOR;

		svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${fill}" rx="2"/>`;

		// X-axis label (rotated if many items)
		const labelX = x + barW / 2;
		const labelY = pad.top + plotH + 14;
		const label = escapeXml(d[labelKey] || "");
		if (data.length > 8) {
			svg += `<text x="${labelX}" y="${labelY}" text-anchor="end" fill="${TEXT_COLOR}" font-size="9" transform="rotate(-45,${labelX},${labelY})">${label}</text>`;
		} else {
			svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" fill="${TEXT_COLOR}" font-size="10">${label}</text>`;
		}
	});

	// Axes
	svg += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="${AXIS_COLOR}" stroke-width="1"/>`;
	svg += `<line x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" stroke="${AXIS_COLOR}" stroke-width="1"/>`;

	svg += `</svg>`;
	return svg;
}

export function buildLineChart({ data, width = 400, height = 250, xKey = "label", yKey = "value", stroke }) {
	if (!data || data.length === 0) return `<svg width="${width}" height="${height}"></svg>`;

	const pad = { top: 20, right: 20, bottom: 50, left: 60 };
	const plotW = width - pad.left - pad.right;
	const plotH = height - pad.top - pad.bottom;
	const maxVal = Math.max(...data.map(d => d[yKey] || 0));
	const { step, max } = niceScale(maxVal);
	const lineColor = stroke || ACCENT_COLOR;

	let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

	// Gridlines and Y-axis labels
	for (let v = 0; v <= max; v += step) {
		const y = pad.top + plotH - (v / max) * plotH;
		svg += `<line x1="${pad.left}" y1="${y}" x2="${pad.left + plotW}" y2="${y}" stroke="${GRID_COLOR}" stroke-width="0.5" stroke-dasharray="3,3"/>`;
		svg += `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" fill="${TEXT_COLOR}" font-size="10">${escapeXml(v.toLocaleString())}</text>`;
	}

	// Build points
	const points = data.map((d, i) => {
		const x = pad.left + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
		const val = d[yKey] || 0;
		const y = pad.top + plotH - (max > 0 ? (val / max) * plotH : 0);
		return { x, y, d };
	});

	// Line path
	if (points.length > 1) {
		const pathD = points.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
		svg += `<path d="${pathD}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round"/>`;
	}

	// Dots and X-axis labels
	points.forEach((p, i) => {
		svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${lineColor}" stroke="oklch(0.15 0.01 260)" stroke-width="1"/>`;

		const label = escapeXml(p.d[xKey] || "");
		const labelY = pad.top + plotH + 14;
		if (data.length > 10) {
			if (i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) {
				svg += `<text x="${p.x.toFixed(1)}" y="${labelY}" text-anchor="middle" fill="${TEXT_COLOR}" font-size="9">${label}</text>`;
			}
		} else {
			svg += `<text x="${p.x.toFixed(1)}" y="${labelY}" text-anchor="middle" fill="${TEXT_COLOR}" font-size="10">${label}</text>`;
		}
	});

	// Axes
	svg += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="${AXIS_COLOR}" stroke-width="1"/>`;
	svg += `<line x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" stroke="${AXIS_COLOR}" stroke-width="1"/>`;

	svg += `</svg>`;
	return svg;
}

export function buildHorizontalBarChart({ data, width = 400, height = 250, labelKey = "label", valueKey = "value", colorFn }) {
	if (!data || data.length === 0) return `<svg width="${width}" height="${height}"></svg>`;

	const pad = { top: 20, right: 60, bottom: 20, left: 120 };
	const plotW = width - pad.left - pad.right;
	const plotH = height - pad.top - pad.bottom;
	const maxVal = Math.max(...data.map(d => Math.abs(d[valueKey] || 0)));
	const { step, max } = niceScale(maxVal);
	const barH = Math.max(4, (plotH / data.length) * 0.7);
	const gap = (plotH / data.length) - barH;

	let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

	// Gridlines and X-axis labels at top
	for (let v = 0; v <= max; v += step) {
		const x = pad.left + (v / max) * plotW;
		svg += `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + plotH}" stroke="${GRID_COLOR}" stroke-width="0.5" stroke-dasharray="3,3"/>`;
	}

	// Bars
	data.forEach((d, i) => {
		const y = pad.top + i * (barH + gap) + gap / 2;
		const val = Math.abs(d[valueKey] || 0);
		const w = max > 0 ? (val / max) * plotW : 0;
		const fill = colorFn ? colorFn(d, i) : ACCENT_COLOR;

		// Label on left
		const label = escapeXml(d[labelKey] || "");
		svg += `<text x="${pad.left - 8}" y="${y + barH / 2 + 4}" text-anchor="end" fill="${TEXT_COLOR}" font-size="10">${label}</text>`;

		// Bar
		svg += `<rect x="${pad.left}" y="${y}" width="${w}" height="${barH}" fill="${fill}" rx="2"/>`;

		// Value on right
		svg += `<text x="${pad.left + w + 6}" y="${y + barH / 2 + 4}" text-anchor="start" fill="${TEXT_COLOR}" font-size="10">${escapeXml(val.toLocaleString())}</text>`;
	});

	// Axes
	svg += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="${AXIS_COLOR}" stroke-width="1"/>`;
	svg += `<line x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" stroke="${AXIS_COLOR}" stroke-width="1"/>`;

	svg += `</svg>`;
	return svg;
}
