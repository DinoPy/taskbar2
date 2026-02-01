
export const parseString = (text) => {
    const replacements = ['"', '`', ',']
    const regex = new RegExp(replacements.join('|'), 'g');

    return text.replaceAll(regex, '');
}

export const setupFuzzyFinder = ({
    inputElement,
    containerElement, // Container to append the list to
    getAllTags, // () => string[]
    onSelectTag, // (tag) => void
    getExcludedTags = () => [], // () => string[]
    onCustomEnter = null, // (inputValue) => void
}) => {
    const list = document.createElement("div");
    list.className = "suggestions-list";
    containerElement.appendChild(list);

    // Ensure parent is relative for absolute positioning of list
    const computedStyle = window.getComputedStyle(containerElement);
    if (computedStyle.position === 'static') {
        containerElement.style.position = 'relative';
    }

    let selectedIndex = -1;
    let currentMatches = [];

    const close = () => {
        list.classList.remove("visible");
        selectedIndex = -1;
    };

    const render = (query) => {
        const all = getAllTags();
        const excluded = getExcludedTags();

        let matches = [];
        if (!query) {
            // Show all (or recent/popular?) if input is empty? 
            matches = all.filter(t => !excluded.includes(t));
        } else {
            matches = all.filter(t =>
                t.toLowerCase().includes(query.toLowerCase()) &&
                !excluded.includes(t)
            );
        }

        // relevance sort: startsWith first
        matches.sort((a, b) => {
            const aStarts = a.toLowerCase().startsWith(query.toLowerCase());
            const bStarts = b.toLowerCase().startsWith(query.toLowerCase());
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return a.localeCompare(b);
        });

        // Limit results
        matches = matches.slice(0, 50);

        currentMatches = matches;

        if (matches.length === 0) {
            close();
            return;
        }

        list.innerHTML = "";
        matches.forEach((tag, idx) => {
            const item = document.createElement("div");
            item.className = "suggestion-item";
            item.textContent = tag;
            item.addEventListener("mousedown", (e) => {
                e.preventDefault();
                onSelectTag(tag);
                close();
                inputElement.value = "";
                inputElement.focus();
            });
            item.addEventListener("mouseover", () => {
                selectedIndex = idx;
                updateSelection();
            });
            list.appendChild(item);
        });

        // Position it
        list.style.top = (inputElement.offsetTop + inputElement.offsetHeight) + "px";
        list.style.left = inputElement.offsetLeft + "px";
        list.style.width = inputElement.offsetWidth + "px";

        list.classList.add("visible");
        selectedIndex = -1;
    };

    const updateSelection = () => {
        const items = list.querySelectorAll(".suggestion-item");
        items.forEach((item, idx) => {
            if (idx === selectedIndex) item.classList.add("selected");
            else item.classList.remove("selected");
        });
    };

    inputElement.addEventListener("focus", () => {
        // Optional: show suggestions on focus even if empty
        render(inputElement.value);
    });

    inputElement.addEventListener("input", (e) => {
        render(e.target.value);
    });

    inputElement.addEventListener("blur", () => {
        setTimeout(close, 200);
    });

    inputElement.addEventListener("keydown", (e) => {
        // If list is not visible, verify if we should open it (e.g. ArrowDown)
        if (!list.classList.contains("visible") && e.key === "ArrowDown") {
            render(inputElement.value);
            return;
        }

        if (e.key === "ArrowDown") {
            if (!list.classList.contains("visible")) return;
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % currentMatches.length;
            updateSelection();
            const selected = list.children[selectedIndex];
            if (selected) selected.scrollIntoView({ block: "nearest" });
        } else if (e.key === "ArrowUp") {
            if (!list.classList.contains("visible")) return;
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + currentMatches.length) % currentMatches.length;
            updateSelection();
            const selected = list.children[selectedIndex];
            if (selected) selected.scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter") {
            if (list.classList.contains("visible") && selectedIndex >= 0 && currentMatches[selectedIndex]) {
                e.preventDefault();
                e.stopImmediatePropagation();
                onSelectTag(currentMatches[selectedIndex]);
                close();
                inputElement.value = "";
            } else if (onCustomEnter) {
                // If text is entered but no suggestion selected, use custom handler
                // Stop propagation to prevent duplicate handlers
                e.preventDefault();
                e.stopImmediatePropagation();
                onCustomEnter(inputElement.value);
                close();
            }
        } else if (e.key === "Escape") {
            if (list.classList.contains("visible")) {
                e.preventDefault(); // Only prevent default if we're closing the list
                e.stopImmediatePropagation();
                close();
            }
        }
    });

    return {
        refresh: () => render(inputElement.value)
    };
};
