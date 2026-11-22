/* ==================================================
   CENTRAL NUMBER LOCALIZATION
   One formatter/parser for every calculator and page.

   Display formatting follows the currently selected
   website language. Internal calculation values remain
   plain JavaScript numbers / ASCII numeric strings and
   are never changed by localization.
================================================== */
(function () {
    "use strict";

    var STORAGE_KEY = "mw-lang";

    /* Locale configuration for the 9 supported website languages.
       numberingSystem is passed explicitly so digit rendering is
       stable across browsers/ICU data. */
    var CONFIG = {
        mr: { locale: "mr-IN", numberingSystem: "deva", decimal: ".", group: "," },
        hi: { locale: "hi-IN", numberingSystem: "deva", decimal: ".", group: "," },
        en: { locale: "en-US", numberingSystem: "latn", decimal: ".", group: "," },
        de: { locale: "de-DE", numberingSystem: "latn", decimal: ",", group: "." },
        es: { locale: "es-ES", numberingSystem: "latn", decimal: ",", group: "." },
        fr: { locale: "fr-FR", numberingSystem: "latn", decimal: ",", group: "\u202F" },
        ja: { locale: "ja-JP", numberingSystem: "latn", decimal: ".", group: "," },
        pt: { locale: "pt-BR", numberingSystem: "latn", decimal: ",", group: "." },
        ar: { locale: "ar",    numberingSystem: "arab", decimal: "\u066B", group: "\u066C" }
    };

    var DIGIT_MAPS = {
        deva: { "0":"०","1":"१","2":"२","3":"३","4":"४","5":"५","6":"६","7":"७","8":"८","9":"९" },
        arab: { "0":"٠","1":"١","2":"٢","3":"٣","4":"٤","5":"٥","6":"٦","7":"٧","8":"٨","9":"٩" }
    };

    /* Reverse lookup: any localized digit -> ASCII digit. */
    var REVERSE_DIGITS = {};
    Object.keys(DIGIT_MAPS).forEach(function (system) {
        var map = DIGIT_MAPS[system];
        Object.keys(map).forEach(function (ascii) {
            REVERSE_DIGITS[map[ascii]] = ascii;
        });
    });
    /* Extended Arabic-Indic digits (Persian/Urdu keyboards). Accept on input. */
    var EXTRA_DIGITS = {
        "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9"
    };
    Object.keys(EXTRA_DIGITS).forEach(function (k) { REVERSE_DIGITS[k] = EXTRA_DIGITS[k]; });

    var nfCache = {};

    function currentLanguage() {
        if (window.MW_I18N && window.MW_I18N.language) {
            return window.MW_I18N.language;
        }
        var htmlLang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
        if (htmlLang && CONFIG[htmlLang]) {
            return htmlLang;
        }
        try {
            var stored = window.sessionStorage.getItem(STORAGE_KEY);
            if (stored && CONFIG[stored]) { return stored; }
        } catch (e) { /* ignore */ }
        return "en";
    }

    function configFor(lang) {
        return CONFIG[lang] || CONFIG.en;
    }

    function currentConfig() {
        return configFor(currentLanguage());
    }

    function cacheKey(lang, options) {
        return lang + "|" + JSON.stringify(options || {});
    }

    function formatter(lang, options) {
        var cfg = configFor(lang);
        var opts = Object.assign({ numberingSystem: cfg.numberingSystem }, options || {});
        var key = cacheKey(lang, opts);
        if (!nfCache[key]) {
            nfCache[key] = new Intl.NumberFormat(cfg.locale, opts);
        }
        return nfCache[key];
    }

    function toNumber(value) {
        if (typeof value === "number") { return isFinite(value) ? value : NaN; }
        if (typeof value === "string") { return parse(value); }
        var n = Number(value);
        return isFinite(n) ? n : NaN;
    }

    /* ---------- display formatting ---------- */

    function format(value, options, lang) {
        var num = typeof value === "number" ? value : toNumber(value);
        if (!isFinite(num)) { return ""; }
        var l = lang || currentLanguage();
        return formatter(l, options).format(num);
    }

    function formatNumber(value, decimals) {
        var d = decimals === undefined ? 2 : decimals;
        return format(value, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: true });
    }

    function formatInteger(value) {
        return format(value, { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true });
    }

    function formatDecimal(value, decimals) {
        return formatNumber(value, decimals === undefined ? 2 : decimals);
    }

    function formatWeight(value, decimals) {
        return formatNumber(value, decimals === undefined ? 3 : decimals);
    }

    function formatDimension(value, decimals) {
        if (decimals === undefined) {
            var abs = Math.abs(typeof value === "number" ? value : toNumber(value));
            if (!isFinite(abs)) { return ""; }
            decimals = abs < 10 ? 2 : (abs < 100 ? 1 : 0);
        }
        return format(value, { minimumFractionDigits: 0, maximumFractionDigits: decimals, useGrouping: false });
    }

    function formatPercent(value, decimals) {
        return formatNumber(value, decimals === undefined ? 2 : decimals);
    }

    function formatQuantity(value) {
        var num = typeof value === "number" ? value : toNumber(value);
        if (!isFinite(num)) { return ""; }
        return format(Math.round(num), { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true });
    }

    /* Format a raw numeric string (ASCII digits, optional dot, optional minus)
       into the current locale's display without changing its numeric meaning.
       Keeps a trailing decimal point while the user is typing. */
    function localizeNumericString(raw, lang) {
        if (raw === null || raw === undefined) { return ""; }
        var str = String(raw).trim();
        var l = lang || currentLanguage();
        if (str === "") { return ""; }
        if (str === "-" || str === "+" || str === "." || str === "-." || str === "+.") {
            return localizeDigits(str.replace(".", configFor(l).decimal), l);
        }
        var match = str.match(/^([+-]?)(\d+)(?:\.(\d*))?$/);
        if (!match) {
            var parsed = parse(str, l);
            if (isFinite(parsed)) {
                return format(parsed, { maximumFractionDigits: 20, useGrouping: false }, l);
            }
            return localizeDigits(str, l);
        }
        var sign = match[1] === "-" ? "-" : (match[1] === "+" ? "+" : "");
        var intPart = match[2];
        var fracPart = match[3];
        var intNum = Number(intPart);
        var formattedInt = format(isFinite(intNum) ? intNum : 0, {
            minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true
        }, l);
        var cfg = configFor(l);
        var out = sign + formattedInt;
        if (fracPart !== undefined) {
            out += cfg.decimal + localizeDigits(fracPart, l);
        }
        return out;
    }

    function localizeDigits(str, lang) {
        if (str === null || str === undefined) { return ""; }
        var s = String(str);
        var l = lang || currentLanguage();
        var cfg = configFor(l);
        var map = DIGIT_MAPS[cfg.numberingSystem];
        if (!map) { return s; }
        return s.replace(/[0-9]/g, function (d) { return map[d] || d; });
    }

    function delocalizeDigits(str) {
        if (str === null || str === undefined) { return ""; }
        return String(str).replace(/[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F]/g, function (ch) {
            return REVERSE_DIGITS[ch] || ch;
        });
    }

    /* ---------- parsing ---------- */

    function parse(value, lang) {
        if (typeof value === "number") { return isFinite(value) ? value : NaN; }
        if (value === null || value === undefined) { return NaN; }
        var str = String(value).trim();
        if (str === "") { return NaN; }

        var l = lang || currentLanguage();
        var cfg = configFor(l);

        // Normalize whitespace (French narrow no-break space, NBSP, thin spaces)
        str = str.replace(/[\u00A0\u202F\u2009\u2007\u2060\s]/g, " ");
        str = delocalizeDigits(str);
        str = str.replace(/ /g, "");
        str = str.replace(/[\u2212\u2012\u2013\u2014]/g, "-");

        var localeDecimal = cfg.decimal;
        var localeGroup = cfg.group;
        var hasLocaleDecimal = str.indexOf(localeDecimal) !== -1;
        var hasLocaleGroup = str.indexOf(localeGroup) !== -1;
        var hasDot = str.indexOf(".") !== -1;
        var hasComma = str.indexOf(",") !== -1;
        var hasArabicDecimal = str.indexOf("\u066B") !== -1;
        var hasArabicGroup = str.indexOf("\u066C") !== -1;

        if (hasLocaleGroup) { str = str.split(localeGroup).join(""); }
        if (hasArabicGroup && localeGroup !== "\u066C") { str = str.split("\u066C").join(""); }
        // Strip common ASCII group separators that conflict with locale decimal
        if (localeDecimal !== "," && hasComma && (hasDot || hasLocaleDecimal)) { str = str.split(",").join(""); }
        if (localeDecimal !== "." && hasDot && (hasComma || hasLocaleDecimal || localeDecimal === ",")) {
            if (localeDecimal === ",") { str = str.split(".").join(""); }
        }

        if (str.indexOf(localeDecimal) !== -1) {
            str = replaceLast(str, localeDecimal, ".");
        } else if (hasArabicDecimal && localeDecimal !== "\u066B") {
            str = replaceLast(str, "\u066B", ".");
        } else if (hasDot && hasComma) {
            var lastDot = str.lastIndexOf(".");
            var lastComma = str.lastIndexOf(",");
            if (lastComma > lastDot) {
                str = str.split(".").join("");
                str = replaceLast(str, ",", ".");
            } else {
                str = str.split(",").join("");
            }
        } else if (localeDecimal === "." && hasComma && !hasDot) {
            str = replaceLast(str, ",", ".");
        } else if (localeDecimal === "," && hasDot && !hasComma) {
            // keep dot as decimal (forgiving)
        }

        str = str.replace(/['\u2019]/g, "");

        if (!/^[+-]?\d*(?:\.\d*)?$/.test(str) || str === "" || str === "+" || str === "-" || str === "." || str === "+." || str === "-.") {
            return NaN;
        }
        var num = Number(str);
        return isFinite(num) ? num : NaN;
    }

    function replaceLast(str, needle, replacement) {
        var idx = str.lastIndexOf(needle);
        if (idx === -1) { return str; }
        return str.substring(0, idx) + replacement + str.substring(idx + needle.length);
    }

    function decimalSeparator(lang) { return configFor(lang || currentLanguage()).decimal; }
    function groupSeparator(lang) { return configFor(lang || currentLanguage()).group; }

    /* Parse the value of an input element. Prefers data-nk-raw (canonical ASCII)
       when present, otherwise parses the displayed value. */
    function parseInput(input) {
        if (!input) { return NaN; }
        var raw = input.getAttribute("data-nk-raw");
        if (raw !== null && raw !== undefined && raw !== "") {
            var n = Number(raw);
            if (isFinite(n)) { return n; }
        }
        return parse(input.value);
    }

    /* For calculators that read input.value directly: return canonical numeric string. */
    function readInputValue(input) {
        if (!input) { return ""; }
        var raw = input.getAttribute("data-nk-raw");
        if (raw !== null && raw !== undefined) { return raw; }
        return String(input.value || "");
    }

    function setInputValue(input, canonical, options) {
        if (!input) { return; }
        var opts = options || {};
        var canonicalStr = (canonical === "" || canonical === null || canonical === undefined)
            ? "" : String(canonical);
        if (input.classList && input.classList.contains("nk-field")) {
            input.setAttribute("data-nk-raw", canonicalStr);
            input.value = (opts.localized === false || canonicalStr === "")
                ? canonicalStr
                : localizeNumericString(canonicalStr);
        } else {
            if (input.hasAttribute("data-nk-raw")) {
                input.setAttribute("data-nk-raw", canonicalStr);
            }
            input.value = canonicalStr;
        }
    }

    function relocalizeInputs() {
        var fields = document.querySelectorAll("input.nk-field[data-nk-raw]");
        Array.prototype.forEach.call(fields, function (field) {
            var raw = field.getAttribute("data-nk-raw");
            if (raw === null || raw === undefined) { return; }
            field.value = raw === "" ? "" : localizeNumericString(raw);
        });
    }

    function relocalizeDocument() {
        relocalizeInputs();
    }

    window.addEventListener("mw:languagechange", function () {
        nfCache = {};
        relocalizeDocument();
    });

    window.MWNumber = {
        CONFIG: CONFIG,
        DIGIT_MAPS: DIGIT_MAPS,
        currentLanguage: currentLanguage,
        configFor: configFor,
        currentConfig: currentConfig,
        decimalSeparator: decimalSeparator,
        groupSeparator: groupSeparator,
        format: format,
        formatNumber: formatNumber,
        formatInteger: formatInteger,
        formatDecimal: formatDecimal,
        formatWeight: formatWeight,
        formatDimension: formatDimension,
        formatPercent: formatPercent,
        formatQuantity: formatQuantity,
        localizeDigits: localizeDigits,
        delocalizeDigits: delocalizeDigits,
        localizeNumericString: localizeNumericString,
        parse: parse,
        parseInput: parseInput,
        readInputValue: readInputValue,
        setInputValue: setInputValue,
        relocalizeInputs: relocalizeInputs,
        relocalizeDocument: relocalizeDocument
    };
})();
