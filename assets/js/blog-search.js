// Simple client-side text filter for the blog post list.
(function () {
    "use strict";

    const input = document.getElementById("post-search");
    if (!input) return;

    const cards = Array.from(document.querySelectorAll(".post-card"));
    const empty = document.getElementById("search-empty");

    function applyFilter() {
        const q = input.value.trim().toLowerCase();
        let visible = 0;

        for (const card of cards) {
            const match = card.textContent.toLowerCase().includes(q);
            card.classList.toggle("is-hidden", !match);
            if (match) visible++;
        }

        if (empty) empty.hidden = visible > 0;
    }

    input.addEventListener("input", applyFilter);

    // Focus the search box with "/" from anywhere on the page.
    document.addEventListener("keydown", (e) => {
        if (e.key !== "/" || document.activeElement === input) return;
        if (/^(?:input|textarea|select)$/i.test(document.activeElement.tagName)) return;
        e.preventDefault();
        input.focus();
    });
})();
