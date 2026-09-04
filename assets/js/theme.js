// Light/dark theme toggle with localStorage persistence.
// The initial theme is applied by an inline script in <head> (before first
// paint); this script wires up the toggle button and OS preference changes.
(function () {
    "use strict";

    var root = document.documentElement;
    var button = document.getElementById("theme-toggle");
    var media = window.matchMedia("(prefers-color-scheme: light)");

    function currentTheme() {
        return root.getAttribute("data-theme") === "light" ? "light" : "dark";
    }

    function apply(theme) {
        root.setAttribute("data-theme", theme);
        try {
            localStorage.setItem("theme", theme);
        } catch (e) {
            /* storage unavailable (e.g. private browsing) — ignore */
        }
    }

    if (button) {
        button.addEventListener("click", function () {
            apply(currentTheme() === "dark" ? "light" : "dark");
        });
    }

    // Follow OS preference changes until the user makes an explicit choice.
    if (media.addEventListener) {
        media.addEventListener("change", function (e) {
            var stored = null;
            try {
                stored = localStorage.getItem("theme");
            } catch (err) {
                /* ignore */
            }
            if (!stored) {
                root.setAttribute("data-theme", e.matches ? "light" : "dark");
            }
        });
    }
})();
