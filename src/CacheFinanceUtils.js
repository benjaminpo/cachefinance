/*  *** DEBUG START ***
//  Remove comments for testing in NODE

import { ScriptSettings } from "./ScriptSettings.js";
export { CacheFinanceUtils, SiteThrottle, ThresholdPeriod };

class Logger {
    static log(msg) {
        console.log(msg);
    }
}
//  *** DEBUG END ***/

/**
 * @classdesc Multi-purpose functions used within the cache finance custom functions.
 */
class CacheFinanceUtils {                       // skipcq: JS-0128
    /**
     * 
     * @param {String[]} symbols 
     * @param {String} attribute 
     */
    static bulkShortCacheRemoveAll(symbols, attribute) {
        const cacheKeyList = CacheFinanceUtils.createCacheKeyList(symbols, attribute);
        CacheService.getScriptCache().removeAll(cacheKeyList);
    }

    /**
     * 
     * @param {any[]} symbols 
     * @param {String} attribute 
     * @returns {any[]} 
     */
    static bulkShortCacheGet(symbols, attribute) {
        const cacheKeyList = CacheFinanceUtils.createCacheKeyList(symbols, attribute);
        return CacheFinanceUtils.getFinanceValuesFromShortCache(cacheKeyList);
    }

    /**
     * 
     * @param {any[]} symbols 
     * @param {String} attribute 
     * @param {any[]} newCacheData 
     * @param {Number} cacheSeconds
     */
    static bulkShortCachePut(symbols, attribute, newCacheData, cacheSeconds) {
        if (symbols.length === 0 || newCacheData.length === 0) {
            return;
        }

        const cacheKeyList = CacheFinanceUtils.createCacheKeyList(symbols, attribute);
        CacheFinanceUtils.putFinanceValuesIntoShortCache(cacheKeyList, newCacheData, cacheSeconds);
    }

    /**
     * Create unique key/value key, filter out bad data, save to script settings (long cache).
     * @param {any[]} symbols 
     * @param {String} attribute 
     * @param {any[]} cacheData 
     */
    static bulkLongCachePut(symbols, attribute, cacheData, daysToHold = 7) {
        const cacheKeys = CacheFinanceUtils.createCacheKeyList(symbols, attribute);
        const newCacheKeys = [];
        const newCacheData = [];

        cacheKeys.forEach((key, i) => {
            if (CacheFinanceUtils.isValidGoogleValue(cacheData[i])) {
                newCacheKeys.push(key);
                newCacheData.push(cacheData[i])
            }
        });

        ScriptSettings.putAllKeysWithData(newCacheKeys, newCacheData, daysToHold);
    }

    /**
     * 
     * @param {String[]} symbols 
     * @param {String} attribute 
     * @returns {any[]}
     */
    static bulkLongCacheGet(symbols, attribute) {
        const cacheKeyList = CacheFinanceUtils.createCacheKeyList(symbols, attribute);
        return ScriptSettings.getAll(cacheKeyList);
    }

    /**
     * 
     * @param {String[]} symbols 
     * @param {String} attribute 
     * @returns {String[]}
     */
    static createCacheKeyList(symbols, attribute) {
        return symbols.map(symbol => CacheFinanceUtils.makeCacheKey(symbol.toUpperCase(), attribute));
    }

    /**
     * 
     * @param {String[]} cacheKeys 
     * @returns {any[]} - A missing cache entry will return 'null'
     */
    static getFinanceValuesFromShortCache(cacheKeys) {
        const shortCache = CacheService.getScriptCache();

        //  Object with key/value pairs for all items found in cache.
        const data = shortCache.getAll(cacheKeys);
        const cachedDataList = [];

        cacheKeys.forEach(key => {
            const parsedData = data[key] === undefined ? null : JSON.parse(data[key]);
            cachedDataList.push(parsedData);
        });

        return cachedDataList;
    }

    /**
     * Puts list of data into cache using one API call.  Data is converted to JSON before it is updated.
     * @param {String[]} cacheKeys 
     * @param {any[]} newCacheData 
     * @param {Number} cacheSeconds
     */
    static putFinanceValuesIntoShortCache(cacheKeys, newCacheData, cacheSeconds = 21600) {
        const bulkData = {};
        let updateCounter = 0;

        for (let i = 0; i < cacheKeys.length; i++) {
            if (CacheFinanceUtils.isValidGoogleValue(newCacheData[i])) {
                bulkData[cacheKeys[i]] = JSON.stringify(newCacheData[i]);
                updateCounter++;
            }
        }

        if (updateCounter > 0) {
            const shortCache = CacheService.getScriptCache();
            shortCache.putAll(bulkData, cacheSeconds);
        }
    }

    /**
     * 
     * @param {String} symbol 
     * @param {String} attribute 
     * @returns {String}
     */
    static makeCacheKey(symbol, attribute) {
        return `${attribute.toUpperCase()}|${symbol.toUpperCase()}`;
    }

    /**
     * Normalize a symbol from Sheets (undefined/null/blank cells become "").
     * @param {any} symbol
     * @returns {String}
     */
    static normalizeSymbolInput(symbol) {
        if (symbol === undefined || symbol === null) {
            return "";
        }

        return symbol.toString().trim().toUpperCase();
    }

    /**
     * Normalize an attribute from Sheets (undefined/null/blank falls back to "price").
     * @param {any} attribute
     * @returns {String}
     */
    static normalizeAttributeInput(attribute) {
        if (attribute === undefined || attribute === null) {
            return "price";
        }

        return attribute.toString().trim();
    }

    /**
     * 
     * @param {String} symbol 
     * @param {String} attribute 
     * @returns {String}
     */
    static makeIgnoreSiteCacheKey(symbol, attribute) {
        return `IGNORE|${CacheFinanceUtils.makeCacheKey(symbol, attribute)}`;
    }

    /**
     * It is common to have extra empty records loaded at end of table.
     * Remove those empty records at END of table only.
     * @param {any[][]} tableData 
     * @returns {any[][]}
     */
    static removeEmptyRecordsAtEndOfTable(tableData) {
        if (!Array.isArray(tableData)) {
            return tableData;
        }

        let blankLines = 0;
        for (let i = tableData.length - 1; i > 0; i--) {
            if (tableData[i].join().replace(/,/g, "").length > 0)
                break;
            blankLines++;
        }

        return tableData.slice(0, tableData.length - blankLines);
    }

    /**
     * 
     * @param {any} value 
     * @returns {Boolean}
     */
    static isValidGoogleValue(value) {
        return value !== null && value !== undefined && value !== "#N/A" && value !== '#ERROR!' && value !== '';
    }

    /**
     * When you request a single column of data from getRange(), it is still a double array.
     * Convert to single array for reguar array processing.
     * @param {any[][]} doubleArray 
     * @param {Number} columnNumber 
     * @returns {any[]}
     */
    static convertRowsToSingleArray(doubleArray, columnNumber = 0) {
        if (!Array.isArray(doubleArray)) {
            return doubleArray;
        }

        return doubleArray.map(item => item[columnNumber]);
    }

    /**
     * 
     * @param {any[]} singleArray 
     * @returns {any[][]}
     */
    static convertSingleToDoubleArray(singleArray) {
        return singleArray.map(item => [item]);
    }

    /**
     * Default short-cache lifetime for historical series (seconds).
     * @returns {Number}
     */
    static get MAX_HISTORICAL_CACHE_SECONDS() {
        return 86400;
    }

    /**
     * Build a historical query object from GOOGLEFINANCE-style parameters.
     * @param {any} startDate
     * @param {any} endDateOrNumDays
     * @param {any} interval
     * @returns {{startDate: Date, endDate: Date, endDateOrNumDays: any, interval: String}|null}
     */
    static buildHistoricalQuery(startDate, endDateOrNumDays, interval) {
        if (startDate === "" || startDate === null || startDate === undefined) {
            return null;
        }

        const dateRange = CacheFinanceUtils.resolveHistoricalDateRange(startDate, endDateOrNumDays);
        if (dateRange === null) {
            return null;
        }

        const hasEnd = endDateOrNumDays !== "" && endDateOrNumDays !== null && endDateOrNumDays !== undefined;

        return {
            startDate: dateRange.start,
            endDate: dateRange.end,
            endDateOrNumDays,
            interval: CacheFinanceUtils.normalizeHistoricalInterval(interval),
            singleDay: !hasEnd
        };
    }

    /**
     * Corrects common parameter misalignment when cmdOption is left empty without a trailing comma.
     * @param {any} cmdOption
     * @param {any} startDate
     * @param {any} endDateOrNumDays
     * @param {any} interval
     * @returns {{startDate: any, endDateOrNumDays: any, interval: any}}
     */
    static resolveHistoricalParameters(cmdOption, startDate, endDateOrNumDays, interval) {
        const cmdDate = CacheFinanceUtils.parseSheetDate(cmdOption);
        const startDateEmpty = startDate === "" || startDate === null || startDate === undefined;

        if (cmdDate !== null && startDateEmpty) {
            return {
                startDate: cmdOption,
                endDateOrNumDays: "",
                interval: CacheFinanceUtils.isHistoricalIntervalToken(endDateOrNumDays) ? endDateOrNumDays : interval
            };
        }

        const looksLikeInterval = CacheFinanceUtils.isHistoricalIntervalToken(endDateOrNumDays);
        const shiftedStartDate = CacheFinanceUtils.parseSheetDate(startDate);
        const shiftedNumDays = CacheFinanceUtils.parseHistoricalNumDays(startDate);

        if (cmdDate !== null && looksLikeInterval && (shiftedStartDate !== null || shiftedNumDays !== null)) {
            return {
                startDate: cmdOption,
                endDateOrNumDays: startDate,
                interval: endDateOrNumDays
            };
        }

        return { startDate, endDateOrNumDays, interval };
    }

    /**
     * Build a historical query from a GOOGLEFINANCE 2D result when explicit dates were omitted.
     * @param {any} googleFinanceValue
     * @param {any} interval
     * @returns {{startDate: Date, endDate: Date, endDateOrNumDays: any, interval: String}|null}
     */
    static buildHistoricalQueryFromSeries(googleFinanceValue, interval = "") {
        if (!CacheFinanceUtils.isValidGoogleHistoricalValue(googleFinanceValue)) {
            return null;
        }

        const dates = googleFinanceValue
            .map(row => (Array.isArray(row) ? CacheFinanceUtils.parseSheetDate(row[0]) : null))
            .filter(date => date !== null);

        if (dates.length === 0) {
            return null;
        }

        dates.sort((a, b) => a.getTime() - b.getTime());

        return {
            startDate: dates[0],
            endDate: dates[dates.length - 1],
            endDateOrNumDays: "",
            interval: CacheFinanceUtils.normalizeHistoricalInterval(interval),
            singleDay: googleFinanceValue.length === 1
        };
    }

    /**
     * @param {any} interval
     * @returns {String}
     */
    static isHistoricalIntervalToken(value) {
        return ["DAILY", "WEEKLY", "1", "7"].includes((value ?? "").toString().toUpperCase().trim());
    }

    static normalizeHistoricalInterval(interval) {
        if (interval === "" || interval === null || interval === undefined) {
            return "DAILY";
        }

        const val = interval.toString().toUpperCase().trim();
        if (val === "1" || val === "DAILY") {
            return "DAILY";
        }
        if (val === "7" || val === "WEEKLY") {
            return "WEEKLY";
        }

        return "DAILY";
    }

    /**
     * @param {any} value
     * @returns {Date|null}
     */
    static parseSheetDate(value) {
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return new Date(value.getTime());
        }

        if (typeof value === "number" && Number.isFinite(value)) {
            if (value > 1000000000000) {
                const fromUnixMs = new Date(value);
                return Number.isNaN(fromUnixMs.getTime()) ? null : fromUnixMs;
            }

            // Google Sheets serial date (days since 1899-12-30).
            const fromSerial = new Date((value - 25569) * 86400 * 1000);
            return Number.isNaN(fromSerial.getTime()) ? null : fromSerial;
        }

        if (typeof value === "string" && value.trim() !== "") {
            const fromString = new Date(value);
            return Number.isNaN(fromString.getTime()) ? null : fromString;
        }

        return null;
    }

    /**
     * @param {any} startDate
     * @param {any} endDateOrNumDays
     * @returns {{start: Date, end: Date}|null}
     */
    static resolveHistoricalDateRange(startDate, endDateOrNumDays) {
        const start = CacheFinanceUtils.parseSheetDate(startDate);
        if (start === null) {
            return null;
        }

        if (endDateOrNumDays === "" || endDateOrNumDays === null || endDateOrNumDays === undefined) {
            return { start, end: new Date(start.getTime()) };
        }

        const numDays = CacheFinanceUtils.parseHistoricalNumDays(endDateOrNumDays);
        if (numDays !== null) {
            const end = new Date(start.getTime());
            end.setUTCDate(end.getUTCDate() + numDays);
            return { start, end };
        }

        const end = CacheFinanceUtils.parseSheetDate(endDateOrNumDays);
        if (end === null) {
            return null;
        }

        return { start, end };
    }

    /**
     * @param {any} value
     * @returns {Number|null}
     */
    static parseHistoricalNumDays(value) {
        if (typeof value === "number" && Number.isFinite(value) && value > 0 && value < 10000) {
            return Math.floor(value);
        }

        if (typeof value === "string" && /^\d+$/.test(value.trim())) {
            const num = Number.parseInt(value.trim(), 10);
            return num > 0 ? num : null;
        }

        return null;
    }

    /**
     * @param {Date} date
     * @returns {Number}
     */
    static toUnixStartOfDay(date) {
        const parsed = CacheFinanceUtils.parseSheetDate(date);
        if (parsed === null) {
            return 0;
        }

        return Math.floor(Date.UTC(
            parsed.getUTCFullYear(),
            parsed.getUTCMonth(),
            parsed.getUTCDate()
        ) / 1000);
    }

    /**
     * @param {String} symbol
     * @param {String} attribute
     * @param {{startDate: Date, endDate: Date, endDateOrNumDays: any, interval: String}} historicalQuery
     * @returns {String}
     */
    static makeHistoricalCacheKey(symbol, attribute, historicalQuery) {
        const startKey = CacheFinanceUtils.formatDateForCacheKey(historicalQuery.startDate);
        const endKey = CacheFinanceUtils.formatDateForCacheKey(historicalQuery.endDate);

        return `HIST|${attribute.toUpperCase()}|${symbol.toUpperCase()}|${startKey}|${endKey}|${historicalQuery.interval}`;
    }

    /**
     * @param {any} date
     * @returns {String}
     */
    static formatDateForCacheKey(date) {
        const parsed = CacheFinanceUtils.parseSheetDate(date);
        if (parsed === null) {
            return "";
        }

        return parsed.toISOString().slice(0, 10);
    }

    /**
     * @param {any} value
     * @returns {Boolean}
     */
    static isValidGoogleHistoricalValue(value) {
        if (!Array.isArray(value) || value.length === 0 || typeof value === "string") {
            return false;
        }

        for (const row of value) {
            if (!Array.isArray(row) || row.length < 2) {
                continue;
            }

            if (CacheFinanceUtils.isValidGoogleValue(row[1])) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param {any[][]} series
     * @returns {any[][]}
     */
    static serializeHistoricalSeries(series) {
        return series.map((row) => {
            if (!Array.isArray(row) || row.length < 2) {
                return row;
            }

            const date = row[0] instanceof Date ? row[0].toISOString() : row[0];
            return [date, row[1]];
        });
    }

    /**
     * @param {any} series
     * @returns {any[][]|null}
     */
    static reviveHistoricalSeries(series) {
        if (!Array.isArray(series)) {
            return null;
        }

        return series.map((row) => {
            if (!Array.isArray(row) || row.length < 2) {
                return row;
            }

            const date = CacheFinanceUtils.parseSheetDate(row[0]);
            return [date ?? row[0], row[1]];
        });
    }

    /**
     * @param {String} cacheKey
     * @param {any[][]} serializedSeries
     * @param {Number} daysToHold
     */
    static putHistoricalValuesIntoLongCache(cacheKey, serializedSeries, daysToHold = 7) {
        if (!CacheFinanceUtils.isValidGoogleHistoricalValue(serializedSeries)) {
            return;
        }

        ScriptSettings.putAllKeysWithData([cacheKey], [serializedSeries], daysToHold);
    }

    /**
     * @param {String} cacheKey
     * @returns {any[][]|null}
     */
    static getHistoricalValuesFromLongCache(cacheKey) {
        const data = ScriptSettings.getAll([cacheKey]);
        if (data[0] === null) {
            return null;
        }

        return CacheFinanceUtils.reviveHistoricalSeries(data[0]);
    }

    /**
     * Return one value from a historical series for a specific day (GOOGLEFINANCE single-date behavior).
     * @param {any[][]} series
     * @param {Date} targetDate
     * @returns {any|null}
     */
    static extractHistoricalScalar(series, targetDate) {
        if (!Array.isArray(series) || series.length === 0) {
            return null;
        }

        const targetKey = CacheFinanceUtils.formatDateForCacheKey(targetDate);
        const matching = series.filter((row) => {
            if (!Array.isArray(row) || row.length < 2) {
                return false;
            }

            return CacheFinanceUtils.formatDateForCacheKey(row[0]) === targetKey;
        });

        const row = matching.length > 0 ? matching[matching.length - 1] : series[series.length - 1];
        const value = Array.isArray(row) ? row[1] : null;

        return CacheFinanceUtils.isValidGoogleValue(value) ? value : null;
    }

    /**
     * @param {any} result
     * @param {{singleDay?: Boolean, startDate: Date}} historicalQuery
     * @returns {any}
     */
    static formatHistoricalResult(result, historicalQuery) {
        if (historicalQuery.singleDay !== true) {
            return result;
        }

        if (CacheFinanceUtils.isValidGoogleValue(result) && !Array.isArray(result)) {
            return result;
        }

        if (!CacheFinanceUtils.isValidGoogleHistoricalValue(result)) {
            return result;
        }

        return CacheFinanceUtils.extractHistoricalScalar(result, historicalQuery.startDate) ?? "#N/A";
    }
}

/**
 * @classdesc Used for tracking throttle use limits for a stock site.
 */
class SiteThrottle {            // skipcq:  JS-0128
    /**
     * @param {String} siteID
     * @param {ThresholdPeriod[]} thresholds 
     */
    constructor(siteID, thresholds) {
        this.siteID = siteID;
        this.thresholds = thresholds;
        this.periodKeys = [];
        this.periodCount = [];
    }

    /**
     * @returns {Boolean} - true is ok to make request
     */
    checkAndIncrement() {
        let inLimit = true;

        //  If this is the first time called, we must do the time intensive read from cache
        //  to get the current api call count for each period we have limits for.
        if (this.periodKeys.length === 0) {
            [this.periodKeys, this.periodCount] = SiteThrottle.getCurrentThresholds(this.thresholds, this.siteID);
        }

        //  Will we exceed any thresholds?
        for (let i = 0; i < this.thresholds.length; i++) {
            inLimit = this.periodCount[i] + 1 < this.thresholds[i].maxPerPeriod;

            if (!inLimit) {
                Logger.log(`Throttle Limit EXCEEDED. ${this.siteID}`);
                break;
            }
        }

        //  If we don't exceed the throttle limits, increment all threshold counters.
        if (inLimit) {
            for (let i = 0; i < this.periodCount.length; i++) {
                this.periodCount[i]++;
            }
        }

        return inLimit;
    }

    /**
     * @param {ThresholdPeriod[]} thresholds 
     * @param {String} siteID 
     * @returns {[String[], Number[]]}
     */
    static getCurrentThresholds(thresholds, siteID) {
        let key = "";
        let current = 0;
        const keys = [];
        const limits = [];

        for (const period of thresholds) {
            switch (period.periodName) {
                case "SECOND":
                    key = SiteThrottle.createSecondKey(siteID);
                    current = SiteThrottle.currentForSecond(key);
                    Logger.log(`SECOND Check.  key=${key}. Current=${current.toString()}.`);
                    break;

                case "MINUTE":
                    key = SiteThrottle.createMinuteKey(siteID);
                    current = SiteThrottle.currentForMinute(key);
                    Logger.log(`MINUTE Check.  key=${key}. Current=${current.toString()}.`);
                    break;

                case "DAY":
                    key = SiteThrottle.createDayKey(siteID);
                    current = SiteThrottle.currentForDay(key);
                    Logger.log(`DAY Check.  key=${key}. Current=${current.toString()}.`);
                    break;

                case "MONTH":
                    key = SiteThrottle.createMonthKey(siteID);
                    current = SiteThrottle.currentForMonth(key);
                    Logger.log(`MONTH Check.  key=${key}. Current=${current.toString()}.`);
                    break;

                default:
                    throw new Error(`Invalid threshold period ${period.periodName}`);
            }

            //  We save the KEY because it may change before we increment.
            //  We save the current value because re-reading is very time consuming.
            keys.push(key);
            limits.push(current);
        }

        return [keys, limits];
    }

    //  At the end of a batch URL fetch, the THROTTLE stats need to be 
    //  saved to cache.
    update() {
        if (this.periodKeys.length === 0) {
            //  Was never used for this site.
            return;
        }

        for (let i = 0; i < this.thresholds.length; i++) {
            const period = this.thresholds[i];
            switch (period.periodName) {
                case "SECOND":
                    SiteThrottle.updateForSecond(this.periodKeys[i], this.periodCount[i]);
                    break;

                case "MINUTE":
                    SiteThrottle.updateForMinute(this.periodKeys[i], this.periodCount[i]);
                    break;

                case "DAY":
                    SiteThrottle.updateForDay(this.periodKeys[i], this.periodCount[i]);
                    break;

                case "MONTH":
                    SiteThrottle.updateForMonth(this.periodKeys[i], this.periodCount[i]);
                    break;

                default:
                    throw new Error(`Invalid threshold period ${period.periodName}`);
            }
        }

        this.periodKeys = [];
        this.periodCount = [];
    }

    /**
     * 
     * @param {String} key 
     * @returns {Number}
     */
    static currentForSecond(key) {
        const shortCache = CacheService.getScriptCache();
        const data = shortCache.get(key);

        return data === null ? 0 : JSON.parse(data);
    }

    /**
     * Current number of requests in THIS minute.  
     * @param {String} key
     * @returns {Number}
     */
    static currentForMinute(key) {
        const shortCache = CacheService.getScriptCache();
        const data = shortCache.get(key);

        return data === null ? 0 : JSON.parse(data);
    }

    /**
     * 
     * @param {String} key 
     * @param {Number} current 
     */
    static updateForSecond(key, current) {
        const shortCache = CacheService.getScriptCache();
        shortCache.put(key, JSON.stringify(current), 10);
    }

    /**
     * Add to minute counter.
     * @param {String} key 
     * @param {Number} current 
     */
    static updateForMinute(key, current) {
        const shortCache = CacheService.getScriptCache();
        shortCache.put(key, JSON.stringify(current), 180);
    }

    /**
     * @param {String} key 
     * @param {Number} current 
     */
    static updateForDay(key, current) {
        const longCache = new ScriptSettings();
        longCache.put(key, current, 2);
    }

    /**
     * @param {String} key 
     * @param {Number} current 
     */
    static updateForMonth(key, current) {
        const longCache = new ScriptSettings();
        longCache.put(key, current, 30);
    }

    /**
     * Current requests made for the day.
     * @param {String} key 
     * @returns {Number}
     */
    static currentForDay(key) {
        const longCache = new ScriptSettings();
        const data = longCache.get(key);

        return data === null ? 0 : data;
    }

    /**
     * Current requests made for the day.
     * @param {String} key 
     * @returns {Number}
     */
    static currentForMonth(key) {
        //  For now it is the same implentation as the DAY, but I want a separate function in case they differ in future.
        return SiteThrottle.currentForDay(key);
    }

    /**
     * 
     * @param {String} siteID 
     * @param {String} intervalName 
     * @param {any} periodNumber - (0-59 -> MINUTE), (0-6 -> DAY) 
     * @returns 
     */
    static makeKey(siteID, intervalName, periodNumber) {
        return `${siteID}:${intervalName}:${periodNumber.toString()}`;
    }

    /**
     * 
     * @param {String} siteID 
     * @returns {String}
     */
    static createSecondKey(siteID) {
        const today = new Date();
        const second = today.getSeconds();

        return SiteThrottle.makeKey(siteID, "SEC", second);
    }

    /**
     * 
     * @param {String} siteID 
     * @returns {String}
     */
    static createMinuteKey(siteID) {
        const today = new Date();
        const minute = today.getMinutes();

        return SiteThrottle.makeKey(siteID, "MIN", minute);
    }

    /**
     * 
     * @param {String} siteID 
     * @returns {String}
     */
    static createDayKey(siteID) {
        const today = new Date();
        const dayNum = today.getDay();      // Day of the week. 0-6
        return SiteThrottle.makeKey(siteID, "DAY", dayNum);
    }

    /**
     * 
     * @param {String} siteID 
     * @returns {String}
     */
    static createMonthKey(siteID) {
        //  Month throttle will only really work if around the same number of request happen per day.
        //  On the first day of a new month, the count will be zero - which does not take into account
        //  the last 29 days of the previous month.  More work is needed for a rolling throttle....
        const today = new Date();
        const dayNum = today.getMonth();      // get month #
        return SiteThrottle.makeKey(siteID, "MONTH", dayNum);
    }
}


/**
 * @classdesc Used to define a throttle limit.
 */
class ThresholdPeriod {         // skipcq:  JS-0128
    constructor(periodName, maxPerPeriod) {
        this._periodName = periodName;
        this._maxPerPeriod = maxPerPeriod;
    }

    get periodName() {
        return this._periodName;
    }
    set periodName(val) {
        this._periodName = val;
    }
    get maxPerPeriod() {
        return this._maxPerPeriod;
    }
    set maxPerPeriod(val) {
        this._maxPerPeriod = val;
    }
}