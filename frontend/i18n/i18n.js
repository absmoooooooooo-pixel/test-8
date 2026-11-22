/* ==================================================
   CENTRAL MULTILINGUAL RUNTIME
   One translator for every page and calculator.

   Every page is an English page. A language choice only
   rewrites visible text in place: the URL, the page's
   links, form values, selected options and calculation
   results are never changed.
================================================== */
(function () {
    "use strict";

    var STORAGE_KEY = "mw-lang";
    var html = document.documentElement;
    var config = window.__MW_I18N_CONFIG || {};
    var languages = config.languages || [];
    var dictionaries = window.MW_I18N_DICTIONARIES || {};
    var currentCode = "en";
    var dictionary = normalizeDictionary(dictionaries.en);
    var currentIndex = indexDictionary(dictionary);
    var pageSources = readSourceMap();
    var nodeSources = new WeakMap();
    var attrSources = new WeakMap();
    var switching = false;
    var observer = null;
    var originalMeta = null;
    var skipSelector = ".lang-switch, script, style, textarea, code, pre, kbd, samp, [data-i18n-skip]";
    var translatedAttrs = ["placeholder", "aria-label", "title", "alt"];

    /* ---------------- dictionary helpers ---------------- */

    function has(object, key) {
        return !!object && Object.prototype.hasOwnProperty.call(object, key);
    }

    function normalizeDictionary(raw) {
        return {
            code: raw && raw.code ? raw.code : "en",
            terms: (raw && raw.terms) || {},
            strings: (raw && raw.strings) || {},
            templates: (raw && raw.templates) || {}
        };
    }

    function indexDictionary(dict) {
        var lowered = {};
        var reverseStrings = {};
        var reverseTerms = {};

        Object.keys(dict.terms || {}).forEach(function (key) {
            lowered[key.toLowerCase()] = dict.terms[key];
            if (dict.terms[key] !== key) {
                reverseTerms[dict.terms[key]] = key;
            }
        });
        Object.keys(dict.strings || {}).forEach(function (key) {
            if (dict.strings[key] !== key) {
                reverseStrings[dict.strings[key]] = key;
            }
        });

        return {
            lowerTerms: lowered,
            reverseStrings: reverseStrings,
            reverseTerms: reverseTerms
        };
    }

    function fill(template, values) {
        return String(template).replace(/\{(\w+)\}/g, function (whole, key) {
            return has(values, key) ? values[key] : whole;
        });
    }

    function termIn(value, dict, index) {
        if (!value) {
            return null;
        }
        if (has(dict.terms, value)) {
            return dict.terms[value];
        }
        var lowered = index.lowerTerms[value.toLowerCase()];
        if (lowered) {
            return lowered;
        }
        if (has(dict.strings, value)) {
            return dict.strings[value];
        }
        return null;
    }

    /* Only complete interface strings and known patterns are translated.
       Formulas, dimensions, standard numbers, grades and values return null
       and therefore stay exactly as written in the English page. */
    function translateWith(text, dict, index) {
        var value = String(text == null ? "" : text).trim();
        if (!value) {
            return null;
        }

        var strings = dict.strings || {};
        var templates = dict.templates || {};
        var terms = dict.terms || {};

        if (has(strings, value)) {
            return strings[value];
        }
        if (has(templates, value)) {
            return templates[value];
        }
        if (has(terms, value)) {
            return terms[value];
        }

        /* Source text in HTML can be wrapped over several lines. Dictionary
           entries are written with single spaces, so compare the collapsed
           form before giving up. */
        var collapsed = value.replace(/\s+/g, " ");

        if (collapsed !== value) {
            var collapsedResult = translateWith(collapsed, dict, index);
            if (collapsedResult !== null) {
                return collapsedResult;
            }
        }

        match = value.match(/^Enter (.+)$/);
        match = value.match(/^(.+) is required\. Please enter a value\.$/);
        if (match && strings["required value"]) {
            return fill(strings["required value"], { term: termIn(match[1], dict, index) || match[1] });
        }

        match = value.match(/^(.+) must be a number greater than zero\.$/);
        if (match && strings["must be number greater than zero"]) {
            return fill(strings["must be number greater than zero"], { term: termIn(match[1], dict, index) || match[1] });
        }

        match = value.match(/^(.+) must be a number\.$/);
        if (match && strings["must be number"]) {
            return fill(strings["must be number"], { term: termIn(match[1], dict, index) || match[1] });
        }

        match = value.match(/^(.+) must be zero or greater\.$/);
        if (match && strings["must be zero or greater"]) {
            return fill(strings["must be zero or greater"], { term: termIn(match[1], dict, index) || match[1] });
        }

        match = value.match(/^(.+) must be greater than zero\.$/);
        if (match && strings["must be greater than zero"]) {
            return fill(strings["must be greater than zero"], { term: termIn(match[1], dict, index) || match[1] });
        }

        match = value.match(/^Thickness must be smaller than the inside radius \(ID \u00f7 2 = (.+)\)\.$/);
        if (match && strings["thickness below inside radius"]) {
            return strings["thickness below inside radius"].replace("{value}", match[1]);
        }

        match = value.match(/^Knuckle radius must be smaller than the inside radius \(ID \u00f7 2 = (.+)\)\.$/);
        if (match && strings["knuckle below inside radius"]) {
            return strings["knuckle below inside radius"].replace("{value}", match[1]);
        }

        match = value.match(/^Dish height must not exceed the inside diameter \(ID = (.+)\)\.$/);
        if (match && strings["dish height below inside diameter"]) {
            return strings["dish height below inside diameter"].replace("{value}", match[1]);
        }

        var match = value.match(/^Enter (.+)$/);
        if (match && templates.enter) {
            var entered = termIn(match[1], dict, index);
            if (entered) {
                return fill(templates.enter, { term: entered });
            }
        }

        match = value.match(/^(.+?) \(([^()]*)\)$/);
        if (match) {
            var labelled = termIn(match[1], dict, index);
            if (labelled) {
                return labelled + " (" + match[2] + ")";
            }
        }

        match = value.match(/^(.+?) \| Metal Weight Calculator$/);
        if (match && templates.siteName) {
            var pageName = translateWith(match[1], dict, index) || match[1];
            return pageName + " | " + templates.siteName;
        }

        match = value.match(/^(.+) Weight Calculator$/);
        if (match && templates.h1) {
            return fill(templates.h1, { name: termIn(match[1], dict, index) || match[1] });
        }

        match = value.match(/^(.+) Dimensions$/);
        if (match && templates.dimensions) {
            return fill(templates.dimensions, { term: termIn(match[1], dict, index) || match[1] });
        }

        match = value.match(/^Current category: (.+)$/);
        if (match && templates.category) {
            return fill(templates.category, { name: termIn(match[1], dict, index) || match[1] });
        }

        match = value.match(/^Volume Per (.+)$/);
        if (match && templates.volumePer) {
            return fill(templates.volumePer, { term: termIn(match[1], dict, index) || match[1] });
        }

        match = value.match(/^Single (.+) Weight$/);
        if (match && templates.weightPer) {
            return fill(templates.weightPer, { term: termIn(match[1], dict, index) || match[1] });
        }

        match = value.match(/^(.+?) \u2014 ([\d.,]+) g\/cm\u00B3$/);
        if (match) {
            var material = termIn(match[1], dict, index);
            if (material) {
                return material + " \u2014 " + match[2] + " g/cm\u00B3";
            }
        }

        match = value.match(/^(.+) is required\. Please enter a valid positive number\.$/);
        if (match && templates.required) {
            return fill(templates.required, { term: termIn(match[1], dict, index) || match[1] });
        }

        match = value.match(/^All dimensions are in (.+?)\.$/);
        if (match) {
            var unit = termIn(match[1], dict, index);
            if (unit && templates.allDimensionsIn) {
                return fill(templates.allDimensionsIn, { unit: unit });
            }
        }

        match = value.match(/^([\d.,]+) metric tonnes$/);
        if (match && templates.tonnes) {
            return fill(templates.tonnes, { value: match[1] });
        }

        match = value.match(/^Hole area removed: ([\d.,]+) mm\u00b2 of ([\d.,]+) mm\u00b2 gross face \(([\d.]+)%\)$/);
        if (match && strings["hole area removed"]) {
            return strings["hole area removed"]
                .replace("{removed}", match[1])
                .replace("{gross}", match[2])
                .replace("{percent}", match[3]);
        }

        match = value.match(/^(\d+) equal divisions at ([\d.]+)\u00B0$/);
        if (match && strings["equal divisions at"]) {
            return strings["equal divisions at"]
                .replace("{count}", match[1])
                .replace("{angle}", match[2]);
        }

        match = value.match(/^(\d+) calculations? saved for this calculator\.$/);
        if (match && strings["calculations saved"] !== undefined) {
            return strings["calculations saved"].replace("{count}", match[1]);
        }

        match = value.match(/^Open calculation history, (\d+) calculations?$/);
        if (match && strings["open history count"] !== undefined) {
            return strings["open history count"].replace("{count}", match[1]);
        }

        match = value.match(/^(\d+(?:[.,]\d+)?) ([A-Za-z][A-Za-z ]{0,12})$/);
        if (match) {
            var measured = termIn(match[2], dict, index);
            if (measured && measured !== match[2]) {
                return match[1] + " " + measured;
            }
        }

        match = value.match(/^(\d+(?:[.,]\d+)?) (pc|pcs)$/);
        if (match) {
            var pieces = strings[match[2]] || match[2];
            return match[1] + " " + pieces;
        }

        match = value.match(/^([\d.,]+) tonnes total \u00b7 (.+)$/);
        if (match) {
            var total = templates.tonnes
                ? fill(templates.tonnes, { value: match[1] })
                : match[1] + " " + (strings["tonnes total"] || "tonnes total");
            return total + " \u00b7 " + (translateWith(match[2], dict, index) || match[2]);
        }

        match = value.match(/^Material: (.+?)( \| (.+))?$/);
        if (match && strings["Material: "]) {
            var named = termIn(match[1], dict, index) || match[1];
            var rest = match[3] ? " | " + (translateWith(match[3], dict, index) || match[3]) : "";
            return strings["Material: "] + named + rest;
        }

        match = value.match(/^Dimensions: (.+)$/);
        if (match && strings["Dimensions: "]) {
            return strings["Dimensions: "] + match[1];
        }

        match = value.match(/^([A-Za-z][A-Za-z ]{1,24}): (.+)$/);
        if (match) {
            var caption = termIn(match[1], dict, index) || strings[match[1]];
            if (caption && caption !== match[1]) {
                return caption + ": " + (translateWith(match[2], dict, index) || match[2]);
            }
        }

        /* Keep a leading icon or arrow (for example ↺ Reset) and translate
           only the human-readable words after it. */
        match = value.match(/^([^A-Za-z0-9]+)\s+(.+)$/);
        if (match) {
            var afterIcon = translateWith(match[2], dict, index);
            if (afterIcon) {
                return match[1] + " " + afterIcon;
            }
        }

        if (value.indexOf(" | ") !== -1 || value.indexOf(" \u00B7 ") !== -1) {
            var separator = value.indexOf(" | ") !== -1 ? " | " : " \u00B7 ";
            var changed = false;
            var mapped = value.split(separator).map(function (segment) {
                var part = translateWith(segment, dict, index);
                if (part && part !== segment) {
                    changed = true;
                    return part;
                }
                return segment;
            });
            if (changed) {
                return mapped.join(separator);
            }
        }

        return null;
    }

    function translate(text) {
        return translateWith(text, dictionary, currentIndex);
    }

    /* ---------------- source recovery ---------------- */

    function readSourceMap() {
        var element = document.getElementById("mw-i18n-sources");
        if (!element) {
            return { text: {}, attrs: {}, kind: "calculator" };
        }
        try {
            var parsed = JSON.parse(element.textContent || "{}");
            parsed.text = parsed.text || {};
            parsed.attrs = parsed.attrs || {};
            return parsed;
        } catch (error) {
            return { text: {}, attrs: {}, kind: "calculator" };
        }
    }

    function reverseText(value) {
        if (has(currentIndex.reverseStrings, value)) {
            return currentIndex.reverseStrings[value];
        }
        if (has(currentIndex.reverseTerms, value)) {
            return currentIndex.reverseTerms[value];
        }
        return null;
    }

    function sourceFor(text, node, trustCache) {
        var value = String(text == null ? "" : text).trim();
        if (!value) {
            return null;
        }

        if (node && nodeSources.has(node)) {
            var cached = nodeSources.get(node);
            if (trustCache) {
                return cached;
            }
            var cachedTranslation = translateWith(cached, dictionary, currentIndex);
            if (cachedTranslation === null ? cached === value : String(cachedTranslation).trim() === value) {
                return cached;
            }
            nodeSources.delete(node);
        }

        if (has(pageSources.text, value)) {
            if (node) {
                nodeSources.set(node, pageSources.text[value]);
            }
            return pageSources.text[value];
        }

        var reversed = reverseText(value);
        if (reversed) {
            if (node) {
                nodeSources.set(node, reversed);
            }
            return reversed;
        }

        /* English pages keep their visible text as the source. Latin text on a
           translated page is normally an untranslated label, so it is also a
           safe source. */
        if (currentCode === "en" || /[A-Za-z]/.test(value)) {
            if (node) {
                nodeSources.set(node, value);
            }
            return value;
        }

        return null;
    }

    function sourceForAttribute(value, element, attribute, trustCache) {
        var current = String(value == null ? "" : value).trim();
        if (!current) {
            return null;
        }

        var stored = attrSources.get(element);
        var cached = stored && stored[attribute];

        if (cached) {
            if (trustCache) {
                return cached;
            }
            var cachedTranslation = translateWith(cached, dictionary, currentIndex);
            if (cachedTranslation === null ? cached === current : String(cachedTranslation).trim() === current) {
                return cached;
            }
            delete stored[attribute];
        }

        if (has(pageSources.attrs, current)) {
            rememberAttribute(element, attribute, pageSources.attrs[current]);
            return pageSources.attrs[current];
        }

        var reversed = reverseText(current);
        if (reversed) {
            rememberAttribute(element, attribute, reversed);
            return reversed;
        }

        if (currentCode === "en" || /[A-Za-z]/.test(current)) {
            rememberAttribute(element, attribute, current);
            return current;
        }

        return null;
    }

    function rememberAttribute(element, attribute, source) {
        var stored = attrSources.get(element);
        if (!stored) {
            stored = {};
            attrSources.set(element, stored);
        }
        stored[attribute] = source;
    }

    /* ---------------- DOM translation ---------------- */

    function shouldSkip(node) {
        var element = node.nodeType === 1 ? node : node.parentElement;
        return !element || !element.closest ? false : !!element.closest(skipSelector);
    }

    function collectTextNodes(root) {
        var nodes = [];
        if (!root) {
            return nodes;
        }
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        while (walker.nextNode()) {
            if (!shouldSkip(walker.currentNode)) {
                nodes.push(walker.currentNode);
            }
        }
        return nodes;
    }

    function applyTextNode(node, trustCache) {
        if (shouldSkip(node)) {
            return false;
        }
        var raw = node.nodeValue;
        if (!raw || raw.trim().length === 0) {
            return false;
        }

        var source = sourceFor(raw, node, trustCache);
        if (!source) {
            return false;
        }

        var translated = currentCode === "en"
            ? source
            : translateWith(source, dictionary, currentIndex);
        if (translated === null) {
            return false;
        }

        var lead = raw.match(/^\s*/)[0];
        var trail = raw.match(/\s*$/)[0];
        var next = lead + translated + trail;
        if (next !== raw) {
            node.nodeValue = next;
        }
        nodeSources.set(node, source);
        return next !== raw;
    }

    function applyAttributes(element, trustCache) {
        if (shouldSkip(element)) {
            return;
        }
        translatedAttrs.forEach(function (attribute) {
            if (!element.hasAttribute || !element.hasAttribute(attribute)) {
                return;
            }
            var source = sourceForAttribute(element.getAttribute(attribute), element, attribute, trustCache);
            if (!source) {
                return;
            }
            var translated = currentCode === "en"
                ? source
                : translateWith(source, dictionary, currentIndex);
            if (translated !== null && translated !== element.getAttribute(attribute)) {
                element.setAttribute(attribute, translated);
            }
            if (translated !== null) {
                rememberAttribute(element, attribute, source);
            }
        });
    }

    function captureAttributeSources(element) {
        translatedAttrs.forEach(function (attribute) {
            if (element.hasAttribute && element.hasAttribute(attribute)) {
                sourceForAttribute(element.getAttribute(attribute), element, attribute);
            }
        });
    }

    function applyPage(trustCache) {
        collectTextNodes(document.body).forEach(function (node) {
            applyTextNode(node, trustCache);
        });
        Array.prototype.forEach.call(
            document.querySelectorAll("[placeholder], [aria-label], [title], [alt]"),
            function (element) {
                applyAttributes(element, trustCache);
            }
        );
    }

    /* ---------------- page chrome ---------------- */

    function languageInfo(code) {
        for (var index = 0; index < languages.length; index += 1) {
            if (languages[index].code === code) {
                return languages[index];
            }
        }
        return { code: code, dir: code === "ar" ? "rtl" : "ltr", ogLocale: code };
    }

    function setMeta(selector, content) {
        if (!content) {
            return;
        }
        var element = document.querySelector(selector);
        if (element) {
            element.setAttribute("content", content);
        }
    }

    function pageHeadingSource() {
        if (pageSources.h1) {
            return pageSources.h1;
        }
        var heading = document.querySelector("h1");
        if (!heading) {
            return "";
        }
        return sourceFor(heading.textContent || "", null) || (heading.textContent || "").trim();
    }

    function translatedPageMeta() {
        var info = pageSources.kind || html.getAttribute("data-mw-page") || "calculator";
        var templates = dictionary.templates || {};
        var siteName = templates.siteName || "";
        var title = "";
        var description = "";

        if (info === "home") {
            title = templates.homeTitle || "";
            description = templates.homeDescription || "";
        } else if (info === "about") {
            title = templates.aboutTitle || "";
            description = templates.aboutDescription || "";
        } else {
            var headingSource = pageHeadingSource();
            var heading = translateWith(headingSource, dictionary, currentIndex) || headingSource;
            title = templates.title ? fill(templates.title, { page: heading }) : "";
            description = templates.description ? fill(templates.description, { name: heading }) : "";
        }

        return { title: title, description: description, siteName: siteName };
    }

    function captureOriginalMeta() {
        originalMeta = {
            title: document.title,
            description: (document.querySelector('meta[name="description"]') || {}).content || "",
            ogTitle: (document.querySelector('meta[property="og:title"]') || {}).content || "",
            ogDescription: (document.querySelector('meta[property="og:description"]') || {}).content || "",
            ogSiteName: (document.querySelector('meta[property="og:site_name"]') || {}).content || "",
            twitterTitle: (document.querySelector('meta[name="twitter:title"]') || {}).content || "",
            twitterDescription: (document.querySelector('meta[name="twitter:description"]') || {}).content || "",
            appleTitle: (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content || "",
            locale: (document.querySelector('meta[property="og:locale"]') || {}).content || "en_US"
        };
    }

    function restoreOriginalMeta() {
        if (!originalMeta) {
            return;
        }
        if (originalMeta.title) {
            document.title = originalMeta.title;
        }
        setMeta('meta[name="description"]', originalMeta.description);
        setMeta('meta[property="og:title"]', originalMeta.ogTitle);
        setMeta('meta[property="og:description"]', originalMeta.ogDescription);
        setMeta('meta[property="og:site_name"]', originalMeta.ogSiteName);
        setMeta('meta[name="twitter:title"]', originalMeta.twitterTitle);
        setMeta('meta[name="twitter:description"]', originalMeta.twitterDescription);
        setMeta('meta[name="apple-mobile-web-app-title"]', originalMeta.appleTitle);
        setMeta('meta[property="og:locale"]', originalMeta.locale);
    }

    function updatePageMeta() {
        if (currentCode === "en" && originalMeta) {
            restoreOriginalMeta();
            return;
        }

        var meta = translatedPageMeta();
        if (meta.title) {
            document.title = meta.title;
            setMeta('meta[property="og:title"]', meta.title);
            setMeta('meta[name="twitter:title"]', meta.title);
        }
        if (meta.description) {
            setMeta('meta[name="description"]', meta.description);
            setMeta('meta[property="og:description"]', meta.description);
            setMeta('meta[name="twitter:description"]', meta.description);
        }
        if (meta.siteName) {
            setMeta('meta[property="og:site_name"]', meta.siteName);
            setMeta('meta[name="apple-mobile-web-app-title"]', meta.siteName);
        }
    }

    function updateLocaleMeta() {
        var info = languageInfo(currentCode);
        setMeta('meta[property="og:locale"]', info.ogLocale || currentCode);
    }

    function updateSwitcher() {
        var switcher = document.querySelector(".lang-switch");
        if (!switcher) {
            return;
        }

        var info = languageInfo(currentCode);
        var label = dictionary.strings && dictionary.strings["Change language"];

        switcher.setAttribute("data-lang", currentCode);
        var summary = switcher.querySelector("summary");
        if (summary) {
            if (label) {
                summary.setAttribute("aria-label", label);
                summary.setAttribute("title", label);
            }
            var short = summary.querySelector("span");
            if (short && info.short) {
                short.textContent = info.short;
            }
        }

        Array.prototype.forEach.call(
            switcher.querySelectorAll(".lang-switch__menu a[hreflang]"),
            function (link) {
                var code = link.getAttribute("hreflang");
                var info = languageInfo(code);
                if (info.nativeName) {
                    link.setAttribute("title", info.nativeName);
                    link.setAttribute("aria-label", info.nativeName);
                }
                if (code === currentCode) {
                    link.setAttribute("aria-current", "true");
                } else {
                    link.removeAttribute("aria-current");
                }
            }
        );
    }

    function rememberLanguage(code) {
        try {
            window.sessionStorage.setItem(STORAGE_KEY, code);
        } catch (error) {
            /* Private browsing can block storage; switching still works. */
        }
    }

    function savedLanguage() {
        try {
            return window.sessionStorage.getItem(STORAGE_KEY) || "";
        } catch (error) {
            return "";
        }
    }

    function updateChrome() {
        var info = languageInfo(currentCode);
        html.setAttribute("lang", currentCode);
        html.setAttribute("dir", info.dir || "ltr");
        html.setAttribute("data-mw-page", pageSources.kind || html.getAttribute("data-mw-page") || "calculator");

        updatePageMeta();
        updateLocaleMeta();
        updateSwitcher();

        var switcher = document.querySelector(".lang-switch");
        if (switcher) {
            switcher.removeAttribute("open");
        }

        try {
            window.dispatchEvent(new CustomEvent("mw:languagechange", { detail: { language: currentCode } }));
        } catch (error) {
            /* CustomEvent is available in every browser this site supports. */
        }
    }

    /* ---------------- switching ---------------- */

    function switchTo(code) {
        if (!code) {
            return Promise.reject(new Error("A language code is required"));
        }
        if (!has(dictionaries, code)) {
            return Promise.reject(new Error("That language is not available"));
        }
        if (code === currentCode) {
            var currentSwitcher = document.querySelector(".lang-switch");
            if (currentSwitcher) {
                currentSwitcher.removeAttribute("open");
            }
            return Promise.resolve(currentCode);
        }
        if (switching) {
            return Promise.reject(new Error("A language switch is already in progress"));
        }

        switching = true;
        try {
            if (observer) {
                observer.disconnect();
            }

            /* Record the English source of every current string before the
               dictionary changes. This is what lets any number of switches
               keep working (for example Marathi -> Japanese -> Arabic). */
            collectTextNodes(document.body).forEach(function (node) {
                sourceFor(node.nodeValue, node);
            });
            Array.prototype.forEach.call(
                document.querySelectorAll("[placeholder], [aria-label], [title], [alt]"),
                captureAttributeSources
            );

            if (!pageSources.h1) {
                var heading = document.querySelector("h1");
                pageSources.h1 = heading
                    ? (sourceFor(heading.textContent || "", null) || (heading.textContent || "").trim())
                    : "";
            }

            currentCode = code;
            dictionary = normalizeDictionary(dictionaries[code]);
            currentIndex = indexDictionary(dictionary);

            /* The capture pass validated every cached source against the old
               dictionary, so the caches are authoritative now. */
            applyPage(true);
            updateChrome();
            rememberLanguage(currentCode);

            if (observer) {
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
            }
            return Promise.resolve(currentCode);
        } catch (error) {
            return Promise.reject(error);
        } finally {
            switching = false;
        }
    }

    /* ---------------- live calculator output ---------------- */

    var scheduled = false;
    var pending = [];

    function flush() {
        scheduled = false;
        var items = pending;
        pending = [];
        if (switching || !observer) {
            return;
        }
        observer.disconnect();
        try {
            items.forEach(function (node) {
                if (node.nodeType === 3) {
                    applyTextNode(node);
                } else if (node.nodeType === 1) {
                    applyTextNode(node);
                    applyAttributes(node);
                    collectTextNodes(node).forEach(applyTextNode);
                    Array.prototype.forEach.call(
                        node.querySelectorAll ? node.querySelectorAll("[placeholder], [aria-label], [title], [alt]") : [],
                        applyAttributes
                    );
                }
            });
        } finally {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });
        }
    }

    observer = new MutationObserver(function (mutations) {
        if (switching) {
            return;
        }
        mutations.forEach(function (mutation) {
            if (mutation.type === "characterData") {
                pending.push(mutation.target);
            } else {
                Array.prototype.forEach.call(mutation.addedNodes, function (node) {
                    if (node.nodeType === 1 || node.nodeType === 3) {
                        pending.push(node);
                    }
                });
            }
        });

        if (!scheduled && pending.length) {
            scheduled = true;
            window.setTimeout(flush, 0);
        }
    });

    function start() {
        if (!document.body) {
            return;
        }

        captureOriginalMeta();
        applyPage();

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        var saved = savedLanguage();
        if (saved && saved !== currentCode && has(dictionaries, saved)) {
            switchTo(saved).catch(function () {
                /* The English page remains usable if a stored choice cannot load. */
            });
        }
    }

    window.MW_I18N = {
        get language() {
            return currentCode;
        },
        t: translate,
        translate: translate,
        switchTo: switchTo
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
