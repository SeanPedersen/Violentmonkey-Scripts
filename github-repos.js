// ==UserScript==
// @name         GitHub README First
// @namespace    local.github.customizations
// @version      3.0.0
// @description  Hides the repository file listing by default and adds a toggle beside GitHub's Code button.
// @match        https://github.com/*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
    "use strict";

    const DEBUG = false;

    const IDS = {
        button: "github-readme-first-toggle",
        styles: "github-readme-first-styles",
    };

    const ATTR = {
        section: "data-github-readme-first-files",
        visible: "data-github-readme-first-visible",
    };

    let currentPath = location.pathname;
    let timer = null;

    function log(...args) {
        if (DEBUG) {
            console.log("[GitHub README First]", ...args);
        }
    }

    function isRepositoryRoot() {
        const parts = location.pathname
            .split("/")
            .filter(Boolean);

        return parts.length === 2;
    }

    function addStyles() {
        if (document.getElementById(IDS.styles)) {
            return;
        }

        const style = document.createElement("style");

        style.id = IDS.styles;

        style.textContent = `
            [${ATTR.section}="true"]:not(
                [${ATTR.visible}="true"]
            ) {
                display: none !important;
            }

            #${IDS.button} {
                appearance: none;
                box-sizing: border-box;

                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;

                width: 76px;
                height: 32px;
                padding: 0 10px;
                margin-left: 8px;

                border: 1px solid
                    var(
                        --button-default-borderColor-rest,
                        var(--color-btn-border, #d0d7de)
                    );

                border-radius: 6px;

                background:
                    var(
                        --button-default-bgColor-rest,
                        var(--color-btn-bg, #f6f8fa)
                    );

                color:
                    var(
                        --button-default-fgColor-rest,
                        var(--color-btn-text, #1f2328)
                    );

                font-family: inherit;
                font-size: 14px;
                font-weight: 500;
                line-height: 20px;

                white-space: nowrap;
                cursor: pointer;
            }

            #${IDS.button}:hover {
                background:
                    var(
                        --button-default-bgColor-hover,
                        var(--color-btn-hover-bg, #f3f4f6)
                    );
            }
        `;

        (document.head || document.documentElement)
            .appendChild(style);
    }

    function normalizeText(value) {
        return (value || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function findHeading(text) {
        const headings = document.querySelectorAll(
            "h1, h2, h3, h4, h5, h6"
        );

        for (const heading of headings) {
            if (
                normalizeText(heading.textContent) === text
            ) {
                return heading;
            }
        }

        return null;
    }

    function findBranchPicker() {
        /*
         * This is present in the HTML you supplied and is much
         * more stable than GitHub's generated CSS-module classes.
         */
        return document.getElementById(
            "ref-picker-repos-header-ref-selector"
        );
    }

    function findCodeButton() {
        const buttons =
            document.querySelectorAll(
                'button[data-component="Button"]'
            );

        for (const button of buttons) {
            if (
                normalizeText(button.textContent) === "Code"
            ) {
                return button;
            }
        }

        return null;
    }

    function findFilesSection() {
        /*
         * Current GitHub layout:
         *
         *   repository controls
         *   latest commit
         *   Folders and files
         *   <file listing>
         *   Repository files navigation
         *   README
         *
         * We use the two accessibility headings as boundaries.
         */
        const filesHeading =
            findHeading("Folders and files");

        const navigationHeading =
            findHeading(
                "Repository files navigation"
            );

        if (
            !filesHeading ||
            !navigationHeading
        ) {
            return null;
        }

        /*
         * Start at the "Folders and files" heading and climb
         * until the next ancestor would also contain the README
         * navigation heading.
         *
         * The resulting element is the largest container that
         * belongs to the files area without swallowing the README.
         */
        let section = filesHeading;

        while (
            section.parentElement &&
            !section.parentElement.contains(
                navigationHeading
            )
        ) {
            section = section.parentElement;
        }

        /*
         * Avoid accidentally choosing the whole repository page.
         */
        if (
            section === document.body ||
            section === document.documentElement
        ) {
            return null;
        }

        return section;
    }

    function findLatestCommitSection(filesSection) {
        /*
         * GitHub puts "Latest commit" immediately before
         * "Folders and files".
         *
         * In some layouts it lives in the same wrapper as the
         * actual table; in others it's a sibling.
         *
         * We deliberately do NOT depend on it. The important part
         * is hiding the file listing itself reliably.
         */
        return filesSection;
    }

    function markFilesHidden() {
        if (!isRepositoryRoot()) {
            return null;
        }

        const section =
            findFilesSection();

        if (!section) {
            return null;
        }

        const actualSection =
            findLatestCommitSection(section);

        if (
            !actualSection.hasAttribute(
                ATTR.section
            )
        ) {
            actualSection.setAttribute(
                ATTR.section,
                "true"
            );

            actualSection.setAttribute(
                ATTR.visible,
                "false"
            );

            log(
                "Repository files section:",
                actualSection
            );
        }

        return actualSection;
    }

    function filesAreVisible(section) {
        return (
            section.getAttribute(
                ATTR.visible
            ) === "true"
        );
    }

    function updateButton(button, visible) {
        button.innerHTML = `
        <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="currentColor"
            style="flex:none"
        >
            ${visible
                ? `
                        <path d="M2.75 3.5A1.75 1.75 0 0 0 1 5.25v5.5c0 .966.784 1.75 1.75 1.75h10.5A1.75 1.75 0 0 0 15 10.75v-5.5a1.75 1.75 0 0 0-1.75-1.75Zm0 1.5h10.5a.25.25 0 0 1 .25.25v5.5a.25.25 0 0 1-.25.25H2.75a.25.25 0 0 1-.25-.25v-5.5A.25.25 0 0 1 2.75 5Z"></path>
                    `
                : `
                        <path d="M1.47 1.47a.75.75 0 0 1 1.06 0l12 12a.75.75 0 1 1-1.06 1.06l-2.16-2.16A7.75 7.75 0 0 1 8 13C4.236 13 1.257 10.651.14 8.37a.75.75 0 0 1 0-.74A8.676 8.676 0 0 1 3.05 4.28L1.47 2.53a.75.75 0 0 1 0-1.06ZM4.14 5.37A6.962 6.962 0 0 0 1.67 8 7.1 7.1 0 0 0 8 11.5c.728 0 1.426-.11 2.08-.312l-1.12-1.12A2.5 2.5 0 0 1 5.93 7.04Zm3.27-.84A2.5 2.5 0 0 1 10.47 7.6l2.02 2.02A7.07 7.07 0 0 0 14.33 8 7.1 7.1 0 0 0 8 4.5c-.2 0-.397.008-.59.03Z"></path>
                    `
            }
        </svg>

        <span>Repo</span>
    `;

        button.setAttribute(
            "aria-label",
            visible
                ? "Hide repository files"
                : "Show repository files"
        );

        button.setAttribute(
            "title",
            visible
                ? "Hide repository files"
                : "Show repository files"
        );

        button.setAttribute(
            "aria-expanded",
            String(visible)
        );
    }

    function setVisible(
        section,
        button,
        visible
    ) {
        section.setAttribute(
            ATTR.visible,
            String(visible)
        );

        updateButton(
            button,
            visible
        );
    }

    function createButton(section) {
        document
            .getElementById(IDS.button)
            ?.remove();

        const button =
            document.createElement("button");

        button.id = IDS.button;
        button.type = "button";

        button.setAttribute(
            "data-component",
            "Button"
        );

        const visible =
            filesAreVisible(section);

        updateButton(
            button,
            visible
        );

        button.addEventListener(
            "click",
            () => {
                setVisible(
                    section,
                    button,
                    !filesAreVisible(section)
                );
            }
        );

        return button;
    }

    function findButtonHost() {
        /*
         * Your supplied HTML gives us two reliable anchors:
         *
         *   #ref-picker-repos-header-ref-selector
         *   button whose label is "Code"
         *
         * The Code button's parent is the right-hand repository
         * controls row, so append our button there.
         */
        const branchPicker =
            findBranchPicker();

        const codeButton =
            findCodeButton();

        if (
            !branchPicker ||
            !codeButton
        ) {
            return null;
        }

        /*
         * Sanity check: both controls should belong to the same
         * repository header area.
         */
        let ancestor =
            codeButton.parentElement;

        while (
            ancestor &&
            ancestor !== document.body
        ) {
            if (
                ancestor.contains(
                    branchPicker
                )
            ) {
                break;
            }

            ancestor =
                ancestor.parentElement;
        }

        if (!ancestor) {
            return null;
        }

        /*
         * Append beside Code rather than to the outer header.
         */
        return codeButton.parentElement;
    }

    function installButton(section) {
        if (
            document.getElementById(
                IDS.button
            )
        ) {
            return;
        }

        const host =
            findButtonHost();

        if (!host) {
            return;
        }

        const button =
            createButton(section);

        /*
         * Put it immediately after the Code button where
         * possible.
         */
        const codeButton =
            findCodeButton();

        if (
            codeButton &&
            codeButton.parentElement === host
        ) {
            codeButton.insertAdjacentElement(
                "afterend",
                button
            );
        } else {
            host.appendChild(button);
        }

        log(
            "Toggle installed.",
            host
        );
    }

    function customize() {
        if (!isRepositoryRoot()) {
            cleanup();
            return;
        }

        const section =
            markFilesHidden();

        if (!section) {
            return;
        }

        installButton(section);
    }

    function cleanup() {
        document
            .getElementById(IDS.button)
            ?.remove();

        document
            .querySelectorAll(
                `[${ATTR.section}]`
            )
            .forEach((element) => {
                element.removeAttribute(
                    ATTR.section
                );

                element.removeAttribute(
                    ATTR.visible
                );
            });
    }

    function schedule(
        delay = 20
    ) {
        clearTimeout(timer);

        timer = setTimeout(
            customize,
            delay
        );
    }

    function detectNavigation() {
        if (
            currentPath ===
            location.pathname
        ) {
            return;
        }

        cleanup();

        currentPath =
            location.pathname;

        schedule(0);
    }

    addStyles();

    /*
     * GitHub's repository page is React/Turbo rendered.
     *
     * MutationObserver fires before the next browser paint, so
     * once "Folders and files" enters the DOM we can mark it hidden
     * immediately.
     */
    const observer =
        new MutationObserver(() => {
            detectNavigation();

            if (!isRepositoryRoot()) {
                return;
            }

            const section =
                markFilesHidden();

            if (
                section &&
                !document.getElementById(
                    IDS.button
                )
            ) {
                installButton(section);
            }
        });

    observer.observe(
        document.documentElement,
        {
            childList: true,
            subtree: true,
        }
    );

    /*
     * Initial page load.
     */
    schedule(0);

    /*
     * GitHub SPA navigation.
     */
    document.addEventListener(
        "turbo:load",
        () => schedule(0)
    );

    document.addEventListener(
        "turbo:render",
        () => schedule(0)
    );

    document.addEventListener(
        "pjax:end",
        () => schedule(0)
    );

    window.addEventListener(
        "popstate",
        () => schedule(0)
    );
})();