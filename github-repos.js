// ==UserScript==
// @name         GitHub README First
// @namespace    local.github.customizations
// @version      1.4.0
// @description  Hides repository files by default and adds a toggle to GitHub's repository top bar.
// @match        https://github.com/*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
    "use strict";

    const DEBUG = false;

    const SELECTORS = {
        repositoryTable: '[class*="Table-module__Box__"]',
        readme: '[class*="OverviewRepoFiles-module__Box_1__"]',
        topBar: '[class*="OverviewContent-module__Box_1__"]',
    };

    const IDS = {
        button: "github-repository-files-toggle",
        styles: "github-readme-first-styles",
        earlyStyles: "github-readme-first-early-styles",
    };

    const ATTRIBUTES = {
        applied: "data-github-readme-first-applied",
        repositorySection: "data-github-repository-section",
        filesVisible: "data-github-files-visible",
    };

    let scheduledTimer = null;

    function log(...args) {
        if (DEBUG) {
            console.log("[GitHub README First]", ...args);
        }
    }

    function warn(...args) {
        console.warn("[GitHub README First]", ...args);
    }

    /*
     * Hide the repository table immediately at document-start.
     *
     * This rule is inserted before GitHub paints the page, preventing the file
     * list from briefly appearing and then disappearing.
     */
    function addEarlyStyles() {
        if (document.getElementById(IDS.earlyStyles)) {
            return;
        }

        const style = document.createElement("style");
        style.id = IDS.earlyStyles;

        style.textContent = `
      ${SELECTORS.repositoryTable}:not(
        [${ATTRIBUTES.filesVisible}="true"]
      ) {
        display: none !important;
      }

      ${SELECTORS.repositoryTable}[
        ${ATTRIBUTES.filesVisible}="true"
      ] {
        display: revert !important;
      }
    `;

        (document.head || document.documentElement).appendChild(style);
    }

    addEarlyStyles();

    function isRepositoryCodePage() {
        const parts = location.pathname.split("/").filter(Boolean);

        // https://github.com/owner/repository
        if (parts.length === 2) {
            return true;
        }

        // https://github.com/owner/repository/tree/branch-or-path
        return parts.length >= 4 && parts[2] === "tree";
    }

    function addMainStyles() {
        if (document.getElementById(IDS.styles)) {
            return;
        }

        const style = document.createElement("style");
        style.id = IDS.styles;

        style.textContent = `
      #${IDS.button} {
        flex-shrink: 0;
        white-space: nowrap;
        margin-left: 8px;
      }

      [${ATTRIBUTES.repositorySection}="true"][
        ${ATTRIBUTES.filesVisible}="false"
      ] {
        display: none !important;
      }

      [${ATTRIBUTES.repositorySection}="true"][
        ${ATTRIBUTES.filesVisible}="true"
      ] {
        display: revert !important;
      }
    `;

        (document.head || document.documentElement).appendChild(style);
    }

    function lowestCommonAncestor(first, second) {
        const ancestors = new Set();

        let node = first;

        while (node) {
            ancestors.add(node);
            node = node.parentElement;
        }

        node = second;

        while (node) {
            if (ancestors.has(node)) {
                return node;
            }

            node = node.parentElement;
        }

        return null;
    }

    /*
     * Returns the direct child beneath `parent` that contains `element`.
     *
     * This lets us operate on the complete repository section instead of only
     * hiding GitHub's inner file table.
     */
    function directChildWithin(element, parent) {
        let node = element;

        while (node?.parentElement && node.parentElement !== parent) {
            node = node.parentElement;
        }

        return node;
    }

    function setFilesVisible(
        repositorySection,
        repositoryTable,
        button,
        visible
    ) {
        const value = String(visible);

        repositorySection.setAttribute(
            ATTRIBUTES.filesVisible,
            value
        );

        repositoryTable.setAttribute(
            ATTRIBUTES.filesVisible,
            value
        );

        button.textContent = visible
            ? "Hide repository files"
            : "Show repository files";

        button.setAttribute("aria-expanded", value);
    }

    function createToggleButton(
        repositorySection,
        repositoryTable
    ) {
        document.getElementById(IDS.button)?.remove();

        const button = document.createElement("button");

        button.id = IDS.button;
        button.type = "button";
        button.className = "Button Button--secondary Button--small";
        button.textContent = "Show repository files";
        button.setAttribute("aria-expanded", "false");

        setFilesVisible(
            repositorySection,
            repositoryTable,
            button,
            false
        );

        button.addEventListener("click", () => {
            const currentlyVisible =
                repositorySection.getAttribute(
                    ATTRIBUTES.filesVisible
                ) === "true";

            setFilesVisible(
                repositorySection,
                repositoryTable,
                button,
                !currentlyVisible
            );
        });

        return button;
    }

    function restoreButtonIfMissing(
        repositoryTable,
        topBar
    ) {
        if (document.getElementById(IDS.button)) {
            return;
        }

        const repositorySection = document.querySelector(
            `[${ATTRIBUTES.repositorySection}="true"]`
        );

        if (!repositorySection) {
            return;
        }

        const button = createToggleButton(
            repositorySection,
            repositoryTable
        );

        topBar.appendChild(button);
    }

    function customizePage() {
        if (!isRepositoryCodePage()) {
            return;
        }

        addMainStyles();

        const repositoryTable = document.querySelector(
            SELECTORS.repositoryTable
        );

        const readmeBox = document.querySelector(
            SELECTORS.readme
        );

        const topBar = document.querySelector(
            SELECTORS.topBar
        );

        log("Repository table:", repositoryTable);
        log("README:", readmeBox);
        log("Top bar:", topBar);

        if (!repositoryTable || !readmeBox || !topBar) {
            return;
        }

        /*
         * GitHub may rerender the top bar independently during client-side
         * navigation. Recreate the button when the page is already customized.
         */
        if (readmeBox.hasAttribute(ATTRIBUTES.applied)) {
            restoreButtonIfMissing(repositoryTable, topBar);
            return;
        }

        const commonParent = lowestCommonAncestor(
            repositoryTable,
            readmeBox
        );

        if (!commonParent) {
            warn(
                "Could not find a shared parent for the repository files and README."
            );
            return;
        }

        const repositorySection = directChildWithin(
            repositoryTable,
            commonParent
        );

        const readmeSection = directChildWithin(
            readmeBox,
            commonParent
        );

        log("Common parent:", commonParent);
        log("Repository section:", repositorySection);
        log("README section:", readmeSection);

        if (
            !repositorySection ||
            !readmeSection ||
            repositorySection === readmeSection ||
            repositorySection.contains(readmeSection) ||
            readmeSection.contains(repositorySection)
        ) {
            warn(
                "Could not safely separate the repository and README sections."
            );
            return;
        }

        /*
         * Keep the repository section in its original position above the README.
         *
         * When hidden, the README moves upward naturally. When toggled open, the
         * repository files appear above the README, matching GitHub's normal layout.
         */
        commonParent.insertBefore(
            repositorySection,
            readmeSection
        );

        repositorySection.setAttribute(
            ATTRIBUTES.repositorySection,
            "true"
        );

        const button = createToggleButton(
            repositorySection,
            repositoryTable
        );

        topBar.appendChild(button);

        readmeBox.setAttribute(
            ATTRIBUTES.applied,
            "true"
        );

        log("Customization applied.");
    }

    function scheduleCustomization() {
        window.clearTimeout(scheduledTimer);

        scheduledTimer = window.setTimeout(
            customizePage,
            150
        );
    }

    /*
     * Run as soon as the initial DOM becomes available.
     */
    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            scheduleCustomization,
            { once: true }
        );
    } else {
        scheduleCustomization();
    }

    /*
     * GitHub uses client-side navigation.
     */
    document.addEventListener(
        "turbo:load",
        scheduleCustomization
    );

    document.addEventListener(
        "pjax:end",
        scheduleCustomization
    );

    /*
     * Handle partial React rerenders, including replacement of the repository
     * top bar or file table.
     */
    new MutationObserver(() => {
        if (!isRepositoryCodePage()) {
            return;
        }

        const buttonMissing =
            !document.getElementById(IDS.button);

        const customizationMissing =
            !document.querySelector(
                `[${ATTRIBUTES.applied}]`
            );

        if (buttonMissing || customizationMissing) {
            scheduleCustomization();
        }
    }).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
})();
