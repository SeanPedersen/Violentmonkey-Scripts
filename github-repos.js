// ==UserScript==
// @name         GitHub README First
// @namespace    local.github.customizations
// @version      1.8.0
// @description  Hides repository files without layout shift, adds a toggle to GitHub's repository top bar and moves Languages below About in the sidebar.
// @match        https://github.com/*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
    "use strict";

    const DEBUG = false;

    const SELECTORS = {
                // GitHub no longer ships "X-module__Box__hash" classes; match stable parts only.
                repositoryTable: 'table[class*="OverviewTable"]',
                readme: "article.markdown-body",
                latestCommitDetails: '[data-testid="latest-commit-details"]',
                topBar: "button:has(.octicon-code)",
                sidebarSection: '[class*="borderGrid"] > [class*="sidebarSection"]',
                sidebarHeading: ":scope > h2",
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
        latestCommitRow: "data-github-latest-commit-row",
        sidebarSection: "data-github-sidebar-section",
    };

    const FOLDER_ICON_SVG = `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>`;

    /* Sidebar sections listed here are pulled to the top, in this order. */
    const SIDEBAR_PRIORITY = ["About", "Languages"];

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

      /* Fallback: no latest-commit row found, hide the whole section. */
      html[${ATTRIBUTES.active}]
        [${ATTRIBUTES.repositorySection}="true"]:not(
          [${ATTRIBUTES.filesVisible}="true"]
        ):not(:has(> [${ATTRIBUTES.latestCommitRow}])) {
        display: none !important;
      }

      /* Keep the latest-commit row visible, hide everything else. */
      html[${ATTRIBUTES.active}]
        [${ATTRIBUTES.repositorySection}="true"]:not(
          [${ATTRIBUTES.filesVisible}="true"]
        ) > :not([${ATTRIBUTES.latestCommitRow}]) {
        display: none !important;
      }

      html[${ATTRIBUTES.active}]
        [${ATTRIBUTES.repositorySection}="true"]:not(
          [${ATTRIBUTES.filesVisible}="true"]
        ) > [${ATTRIBUTES.latestCommitRow}] {
        border-radius: var(--borderRadius-medium, 6px) !important;
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

      ${SIDEBAR_PRIORITY.map((heading, index) => `
      html[${ATTRIBUTES.active}]
        [${ATTRIBUTES.sidebarSection}="${heading}"] {
        order: ${index - SIDEBAR_PRIORITY.length};
      }`).join("")}

      #${IDS.button} {
        box-sizing: border-box;
        flex: 0 0 auto;
        align-self: center;
        white-space: nowrap;
        margin: 0 0 0 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        color: var(--fgColor-muted, #656d76);
        background: var(--button-default-bgColor-rest, transparent);
        border: 1px solid var(--button-default-borderColor-rest, #d0d7de);
        border-radius: 6px;
        cursor: pointer;
      }

      #${IDS.button}:hover {
        background: var(--button-default-bgColor-hover, rgba(128, 128, 128, 0.15));
      }

      #${IDS.button}[aria-pressed="true"] {
        color: var(--fgColor-accent, #0969da);
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
     * Tags prioritized sidebar sections by heading text (GitHub offers no stable
     * hook). The sidebar is a CSS grid, so CSS `order` reorders them without
     * moving React-managed nodes.
     */
    function markSidebarSections() {
        if (!isRepositoryRootPage()) {
            return;
        }

        for (const section of document.querySelectorAll(SELECTORS.sidebarSection)) {
            if (section.hasAttribute(ATTRIBUTES.sidebarSection)) {
                continue;
            }

            const heading = section
                .querySelector(SELECTORS.sidebarHeading)
                ?.textContent.trim();

            if (SIDEBAR_PRIORITY.includes(heading)) {
                section.setAttribute(ATTRIBUTES.sidebarSection, heading);
            }
        }
    }

    /*
     * Marks the section's direct child holding the latest-commit summary so CSS
     * can keep it visible while the file table is collapsed.
     */
    function markLatestCommitRow(repositorySection) {
        if (repositorySection.querySelector(`:scope > [${ATTRIBUTES.latestCommitRow}]`)) {
            return;
        }

        const details = repositorySection.querySelector(
            SELECTORS.latestCommitDetails
        );

        if (!details) {
            return;
        }

        directChildWithin(details, repositorySection)
            .setAttribute(ATTRIBUTES.latestCommitRow, "");
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

        markLatestCommitRow(repositorySection);

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

        const label = visible
            ? "Hide repository files"
            : "Show repository files";

        button.title = label;
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-pressed", value);

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
        button.innerHTML = FOLDER_ICON_SVG;

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

        const topBar = document
            .querySelector(SELECTORS.topBar)
            ?.parentElement;

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

        markSidebarSections();

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
    markSidebarSections();
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
