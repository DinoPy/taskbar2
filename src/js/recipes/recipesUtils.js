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

const MONTHS_SHORT = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
	return y + "-" + m + "-" + d;
}

export function dayLabel(dateStr) {
	const d = new Date(dateStr + "T00:00:00");
	return DAYS_SHORT[d.getDay()] + " " + MONTHS_SHORT[d.getMonth()] + " " + d.getDate();
}

export function addDays(dateStr, days) {
	const d = new Date(dateStr + "T00:00:00");
	d.setDate(d.getDate() + days);
	return formatDateISO(d);
}

export function imageUrl(filePath) {
	const base = (typeof process !== "undefined" && process.env?.APP_STAGE === "production")
		? "https://pythonws.dinodev.dev"
		: "http://localhost:8080";
	return base + "/" + filePath;
}

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

export function mealTypeLabel(type) {
	if (!type) return "";
	return type.charAt(0).toUpperCase() + type.slice(1);
}
