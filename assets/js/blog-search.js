// Simple client-side text filter for the blog post list.
(function () {
    "use strict";

    const input = document.getElementById("post-search");
    if (!input) return;

    const cards = Array.from(document.querySelectorAll(".post-card"));
    const empty = document.getElementById("search-empty");

    // Case- and diacritic-insensitive comparison.
    const fold = (s) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const cardTexts = cards.map((c) => fold(c.textContent));

    function applyFilter() {
        const q = fold(input.value.trim());
        let visible = 0;

        for (let i = 0; i < cards.length; i++) {
            const match = cardTexts[i].includes(q);
            cards[i].classList.toggle("is-hidden", !match);
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
