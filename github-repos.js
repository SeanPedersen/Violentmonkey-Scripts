// ==UserScript==
// @name         GitHub README First
// @namespace    local.github.customizations
// @version      1.5.0
// @description  Hides repository files without layout shift and adds a toggle to GitHub's repository top bar.
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
    };

    const ATTRIBUTES = {
        applied: "data-github-readme-first-applied",
        repositorySection: "data-github-repository-section",
        filesVisible: "data-github-files-visible",
        active: "data-github-readme-first-active",
    };

    let scheduledTimer = null;
    let currentPath = location.pathname;

    function log(...args) {
        if (DEBUG) {
            console.log("[GitHub README First]", ...args);
        }
    }

    function warn(...args) {
        console.warn("[GitHub README First]", ...args);
    }

    function isRepositoryRootPage() {
        const parts = location.pathname.split("/").filter(Boolean);
        return parts.length === 2;
    }

    function updateActiveState() {
        if (isRepositoryRootPage()) {
            document.documentElement.setAttribute(ATTRIBUTES.active, "");
        } else {
            document.documentElement.removeAttribute(ATTRIBUTES.active);
        }
    }

    updateActiveState();

    /*
     * This CSS is installed at document-start.
     *
     * The important part is that the complete repository section is hidden as
     * soon as JavaScript marks it—not only GitHub's inner file table.
     */
    function addStyles() {
        if (document.getElementById(IDS.styles)) {
            return;
        }

        const style = document.createElement("style");
        style.id = IDS.styles;

        style.textContent = `
      html[${ATTRIBUTES.active}]
        ${SELECTORS.repositoryTable}:not(
          [${ATTRIBUTES.filesVisible}="true"]
        ) {
        display: none !important;
      }

      html[${ATTRIBUTES.active}]
        [${ATTRIBUTES.repositorySection}="true"]:not(
          [${ATTRIBUTES.filesVisible}="true"]
        ) {
        display: none !important;
      }

      html[${ATTRIBUTES.active}]
        [${ATTRIBUTES.repositorySection}="true"][
          ${ATTRIBUTES.filesVisible}="true"
        ] {
        display: revert !important;
      }

      html[${ATTRIBUTES.active}]
        ${SELECTORS.repositoryTable}[
          ${ATTRIBUTES.filesVisible}="true"
        ] {
        display: revert !important;
      }

      #${IDS.button} {
        box-sizing: border-box;
        flex: 0 0 auto;
        align-self: center;
        white-space: nowrap;
        margin: 0 0 0 8px;
      }
    `;

        (document.head || document.documentElement).appendChild(style);
    }

    addStyles();

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

    function directChildWithin(element, parent) {
        let node = element;

        while (node?.parentElement && node.parentElement !== parent) {
            node = node.parentElement;
        }

        return node;
    }

    /*
     * Finds the complete repository wrapper using its relationship to the README.
     */
    function identifySections() {
        const repositoryTable = document.querySelector(
            SELECTORS.repositoryTable
        );

        const readmeBox = document.querySelector(
            SELECTORS.readme
        );

        if (!repositoryTable || !readmeBox) {
            return null;
        }

        const commonParent = lowestCommonAncestor(
            repositoryTable,
            readmeBox
        );

        if (!commonParent) {
            return null;
        }

        const repositorySection = directChildWithin(
            repositoryTable,
            commonParent
        );

        const readmeSection = directChildWithin(
            readmeBox,
            commonParent
        );

        if (
            !repositorySection ||
            !readmeSection ||
            repositorySection === readmeSection ||
            repositorySection.contains(readmeSection) ||
            readmeSection.contains(repositorySection)
        ) {
            return null;
        }

        return {
            repositoryTable,
            readmeBox,
            commonParent,
            repositorySection,
            readmeSection,
        };
    }

    /*
     * Runs synchronously from the MutationObserver callback.
     *
     * MutationObserver callbacks execute before the browser's next paint, so
     * marking the full wrapper here prevents the empty wrapper from appearing.
     */
    function hideRepositorySectionImmediately() {
        if (!isRepositoryRootPage()) {
            return null;
        }

        const sections = identifySections();

        if (!sections) {
            return null;
        }

        const {
            repositoryTable,
            repositorySection,
        } = sections;

        if (
            !repositorySection.hasAttribute(
                ATTRIBUTES.repositorySection
            )
        ) {
            repositorySection.setAttribute(
                ATTRIBUTES.repositorySection,
                "true"
            );

            repositorySection.setAttribute(
                ATTRIBUTES.filesVisible,
                "false"
            );

            repositoryTable.setAttribute(
                ATTRIBUTES.filesVisible,
                "false"
            );

            log("Repository section hidden before paint.");
        }

        return sections;
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
        button.className =
            "Button Button--secondary Button--small";

        const currentlyVisible =
            repositorySection.getAttribute(
                ATTRIBUTES.filesVisible
            ) === "true";

        setFilesVisible(
            repositorySection,
            repositoryTable,
            button,
            currentlyVisible
        );

        button.addEventListener("click", () => {
            const visible =
                repositorySection.getAttribute(
                    ATTRIBUTES.filesVisible
                ) === "true";

            setFilesVisible(
                repositorySection,
                repositoryTable,
                button,
                !visible
            );
        });

        return button;
    }

    function customizePage() {
        if (!isRepositoryRootPage()) {
            document.getElementById(IDS.button)?.remove();
            return;
        }

        const sections =
            hideRepositorySectionImmediately();

        const topBar = document.querySelector(
            SELECTORS.topBar
        );

        if (!sections || !topBar) {
            return;
        }

        const {
            repositoryTable,
            readmeBox,
            commonParent,
            repositorySection,
            readmeSection,
        } = sections;

        /*
         * Keep the repository section in its original location above the README.
         * It occupies no space while collapsed.
         */
        if (
            repositorySection.nextElementSibling !==
            readmeSection
        ) {
            commonParent.insertBefore(
                repositorySection,
                readmeSection
            );
        }

        if (!document.getElementById(IDS.button)) {
            const button = createToggleButton(
                repositorySection,
                repositoryTable
            );

            topBar.appendChild(button);
        }

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
            50
        );
    }

    /*
     * Observe immediately at document-start.
     *
     * First, synchronously identify and hide the complete repository wrapper.
     * Then schedule the less urgent button insertion.
     */
    const observer = new MutationObserver(() => {
        const pathChanged = currentPath !== location.pathname;

        if (pathChanged) {
            currentPath = location.pathname;

            updateActiveState();
            document.getElementById(IDS.button)?.remove();
        }

        const sections =
            hideRepositorySectionImmediately();

        if (
            sections &&
            !document.getElementById(IDS.button)
        ) {
            scheduleCustomization();
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    /*
     * Handle pages where enough DOM already exists when the script initializes.
     */
    hideRepositorySectionImmediately();
    scheduleCustomization();

    document.addEventListener(
        "turbo:load",
        scheduleCustomization
    );

    document.addEventListener(
        "pjax:end",
        scheduleCustomization
    );
})();