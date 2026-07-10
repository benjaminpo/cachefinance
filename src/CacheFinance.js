/*  *** DEBUG START ***
//  Remove comments for testing in NODE

import { ScriptSettings } from "./ScriptSettings.js";
import { ThirdPartyFinance, FinanceWebsiteSearch } from "./CacheFinance3rdParty.js";
import { cacheFinanceTest } from "./CacheFinanceTest.js";
import { StockAttributes, FinanceWebSites, YahooApi } from "./CacheFinanceWebSites.js";
import { CacheService, SpreadsheetApp } from "./GasMocks.js";
import { CacheFinanceUtils } from "./CacheFinanceUtils.js";
export { CACHEFINANCE, CACHEFINANCES, CacheFinance };

class Logger {
    static log(msg) {
        console.log(msg);
    }
}
//  *** DEBUG END ***/

/**
 * Enhancement to GOOGLEFINANCE function for stock/ETF symbols that a) return "#N/A" (temporary or consistently), b) data never available like 'yieldpct' for ETF's. 
 * @param {string} symbol - stock ticket with exchange (e.g.  "NYSEARCA:VOO")
 * @param {string} attribute - ["price", "yieldpct", "name"] - 
 * @param {any} googleFinanceValue - Optional.  Use GOOGLEFINANCE() to get default value, if '#N/A' will read cache.
 * BACKDOOR commands are entered using this parameter.
 *  "?" - List all backdoor abilities (SET, GET, SETBLOCKED, GETBLOCKED, LIST, REMOVE, CLEARCACHE, EXPIRECACHE, TEST)
 * e.g. =CACHEFINANCE("", "", "CLEARCACHE") or =CACHEFINANCE("TSE:CJP", "price", "GET")
 * @param {String} cmdOption - Option parameter used only with backdoor commands.
 * @param {any} startDate - Optional. Start date for historical data (GOOGLEFINANCE-style).
 * @param {any} endDateOrNumDays - Optional. End date or number of days from start_date.
 * @param {String} interval - Optional. "DAILY" or "WEEKLY" (also 1 or 7).
 * @returns {any}
 * @customfunction
 */
function CACHEFINANCE(symbol, attribute = "price", googleFinanceValue = "", cmdOption = "", startDate = "", endDateOrNumDays = "", interval = "") {         // skipcq: JS-0128
    symbol = CacheFinanceUtils.normalizeSymbolInput(symbol);
    attribute = CacheFinanceUtils.normalizeAttributeInput(attribute);

    if (symbol === '' || attribute === '') {
        return '';
    }

    const normalizedAttribute = attribute.toUpperCase().trim();

    if (CacheFinanceUtils.isBackdoorCommand(googleFinanceValue)) {
        const providerUpdateMessage = CacheFinance.backDoorCommands(symbol, normalizedAttribute, googleFinanceValue, cmdOption);
        if (providerUpdateMessage !== null) {
            return providerUpdateMessage;
        }
    }

    const historicalParams = CacheFinanceUtils.resolveHistoricalParameters(
        cmdOption,
        startDate,
        endDateOrNumDays,
        interval
    );
    const historicalQuery = CacheFinanceUtils.buildHistoricalQuery(
        historicalParams.startDate,
        historicalParams.endDateOrNumDays,
        historicalParams.interval
    )
        ?? CacheFinanceUtils.buildHistoricalQueryFromSeries(googleFinanceValue, historicalParams.interval);

    if (historicalQuery !== null) {
        return CacheFinance.getHistoricalFinanceData(
            symbol,
            normalizedAttribute,
            googleFinanceValue,
            historicalQuery
        );
    }

    return CacheFinance.resolveSingleFinanceData(symbol, normalizedAttribute, googleFinanceValue);
}

/**
 * Bulk cache retrieval of finance data for updating large quantity of stock attributes.
 * @param {String[][]} symbols 
 * @param {String} attribute - ["price", "yieldpct", "name"]
 * @param {any[][]} defaultValues Default values from GoogleFinance()
 * @param {Number} webSiteLookupCacheSeconds Min. time between Web Lookups (max 21600 seconds)
 * @returns {any}
 * @customfunction
 */
function CACHEFINANCES(symbols, attribute = "price", defaultValues = [], webSiteLookupCacheSeconds = -1) {         // skipcq: JS-0128
    let isSingleLookup = false;
    if (!Array.isArray(symbols) && !Array.isArray(defaultValues)) {
        isSingleLookup = true;
        symbols = [[symbols]];
        defaultValues = [[defaultValues]];
    }

    if (Array.isArray(symbols) && Array.isArray(defaultValues) && defaultValues.length > 0 && symbols.length !== defaultValues.length) {
        throw new Error("Stock symbol RANGE must match default values range.");
    }

    if (defaultValues === undefined || typeof defaultValues === 'string') {
        defaultValues = [];
    }

    const trimmedSymbols = CacheFinanceUtils.removeEmptyRecordsAtEndOfTable(symbols);
    const trimmedValues = CacheFinanceUtils.removeEmptyRecordsAtEndOfTable(defaultValues);

    //  Data ranges from sheets are double arrays.  Just make life simple and convert to single array.
    const singleSymbols = CacheFinanceUtils.convertRowsToSingleArray(trimmedSymbols);
    const newValues = CacheFinanceUtils.convertRowsToSingleArray(trimmedValues);
    const symbolValuePairs = CacheFinanceUtils.pairSymbolsWithValues(singleSymbols, newValues);
    const newSymbols = symbolValuePairs.map(pair => pair.symbol);
    const alignedValues = symbolValuePairs.map(pair => pair.value);
    attribute = CacheFinanceUtils.normalizeAttributeInput(attribute).toUpperCase();

    if (newSymbols.length === 0 || attribute === '') {
        return '';
    }

    Logger.log(`CacheFinances START.  Attribute=${attribute} symbols=${symbols.length} websiteLookupSeconds=${webSiteLookupCacheSeconds}`);

    let financeValues = CacheFinance.getBulkFinanceData(newSymbols, attribute, alignedValues, webSiteLookupCacheSeconds);
    if (isSingleLookup) {
        financeValues = financeValues[0][0];
    }

    return financeValues;
}

/**
 * @classdesc GOOGLEFINANCE helper function.  Returns default value (if available) and set this value to cache OR
 * reads from short term cache (<21600s) and returns value OR
 * reads from 3rd party screen scrapping OR
 * reads from long term cache
 */
class CacheFinance {
    /**
     * 
     * @param {String[]} symbols 
     * @param {String} attribute 
     * @param {any[]} googleFinanceValues 
     * @param {Number} webSiteLookupCacheSeconds
     * @returns {any[][]}
     */
    static getBulkFinanceData(symbols, attribute, googleFinanceValues, webSiteLookupCacheSeconds = -1) {
        const MAX_SHORT_CACHE_SECONDS = 21600;      // For VALID GOOGLEFINANCE values.
        const MAX_SHORT_CACHE_THIRD_PARTY = 1200;   // This will force a lookup every 20 minutes for stocks NEVER found in GOOGLEFINANCE()
        const cacheSeconds = webSiteLookupCacheSeconds === -1 ? MAX_SHORT_CACHE_THIRD_PARTY : webSiteLookupCacheSeconds;

        //  ALL valid google data points are put in SHORT cache (skip unchanged values to reduce cache churn).
        CacheFinanceUtils.bulkShortCachePutIfChanged(symbols, attribute, googleFinanceValues, MAX_SHORT_CACHE_SECONDS);

        //  All invalid data points with a valid entry in short cache is used.
        googleFinanceValues = CacheFinance.updateMissingValuesFromShortCache(symbols, attribute, googleFinanceValues);

        //  Use long cache before any website lookups so sheet sorts/recalculations do not refetch.
        googleFinanceValues = CacheFinance.updateMissingValuesFromLongCache(
            symbols,
            attribute,
            googleFinanceValues,
            cacheSeconds
        );

        //  At this point, it will be mostly items that GOOGLE FINANCE just never works for.
        const symbolsWithNoData = CacheFinance.getSymbolsWithNoValidData(symbols, googleFinanceValues);

        //  Make requests (very slow) from financial web sites to find missing data.
        let symbolsFetchedFromWeb = [];
        if (symbolsWithNoData.length > 0) {
            const symbolsNeedingFetch = CacheFinance.getSymbolsWithoutLongCache(symbolsWithNoData, attribute);
            let symbolsToFetch = CacheFinanceUtils.filterSymbolsNotFetching(symbolsNeedingFetch, attribute);

            if (symbolsToFetch.length < symbolsNeedingFetch.length) {
                googleFinanceValues = CacheFinance.updateMissingValuesFromLongCache(
                    symbols,
                    attribute,
                    googleFinanceValues,
                    cacheSeconds
                );
                const stillMissing = CacheFinance.getSymbolsWithNoValidData(symbols, googleFinanceValues);
                const stillNeedingFetch = CacheFinance.getSymbolsWithoutLongCache(stillMissing, attribute);
                symbolsToFetch = CacheFinanceUtils.filterSymbolsNotFetching(stillNeedingFetch, attribute);
            }

            if (symbolsToFetch.length > 0) {
                CacheFinanceUtils.markSymbolsFetching(symbolsToFetch, attribute);

                try {
                    const thirdPartyStockAtributes = ThirdPartyFinance.getMissingStockAttributesFromThirdParty(symbolsToFetch, attribute);
                    const thirdPartyFinanceValues = CacheFinance.getValuesFromStockAttributes(thirdPartyStockAtributes, attribute);
                    CacheFinanceUtils.bulkShortCachePut(symbolsToFetch, attribute, thirdPartyFinanceValues, cacheSeconds);
                    googleFinanceValues = CacheFinance.updateMasterWithMissed(symbols, googleFinanceValues, symbolsToFetch, thirdPartyFinanceValues);
                    symbolsFetchedFromWeb = symbolsToFetch;
                }
                finally {
                    CacheFinanceUtils.clearSymbolsFetching(symbolsToFetch, attribute);
                }
            }
        }

        // Last, last resort.  Try to find in LONG CACHE.  This could be DAYS old, but it is better than invalid data.
        const lastResortMissingStocks = CacheFinance.getSymbolsWithNoValidData(symbols, googleFinanceValues);
        const longCacheValues = CacheFinanceUtils.bulkLongCacheGet(lastResortMissingStocks, attribute);
        googleFinanceValues = CacheFinance.updateMasterWithMissed(symbols, googleFinanceValues, lastResortMissingStocks, longCacheValues);

        //  Save website results into the long cache for future sheet recalculations (sorts, etc.).
        if (symbolsFetchedFromWeb.length > 0) {
            CacheFinanceUtils.bulkLongCachePut(symbols, attribute, googleFinanceValues);
        }

        return CacheFinanceUtils.convertSingleToDoubleArray(googleFinanceValues);
    }

    /**
     * Instant cache-only path used by CACHEFINANCE() before any logging or website lookup.
     * @param {String} symbol
     * @param {String} attribute
     * @param {any} googleFinanceValue
     * @returns {any|undefined} Returns undefined when a full lookup is required.
     */
    static tryGetCachedFinanceValue(symbol, attribute, googleFinanceValue) {
        const MAX_SHORT_CACHE_SECONDS = 21600;
        const cacheKey = CacheFinanceUtils.makeCacheKey(symbol, attribute);

        // Match GOOGLEFINANCE: when Google returns a valid value, pass it through immediately.
        if (CacheFinanceUtils.isValidGoogleValue(googleFinanceValue)) {
            CacheFinanceUtils.putFinanceValueIfChanged(cacheKey, googleFinanceValue, MAX_SHORT_CACHE_SECONDS);
            CacheFinanceUtils.backfillLongCacheIfMissing(symbol, attribute, googleFinanceValue);
            return googleFinanceValue;
        }

        // GOOGLEFINANCE failed or is still loading — return cache only, never refetch on sort.
        const shortCached = CacheFinance.peekFinanceValueFromShortCache(cacheKey);
        if (CacheFinanceUtils.isValidGoogleValue(shortCached)) {
            return shortCached;
        }

        const longCached = CacheFinance.getFinanceValueFromLongCache(symbol, attribute);
        if (CacheFinanceUtils.isValidGoogleValue(longCached)) {
            return longCached;
        }

        const fetchKey = CacheFinanceUtils.makeFetchingCacheKey(symbol, attribute);
        if (CacheService.getScriptCache().get(fetchKey) !== null) {
            const retryShort = CacheFinance.peekFinanceValueFromShortCache(cacheKey);
            if (CacheFinanceUtils.isValidGoogleValue(retryShort)) {
                return retryShort;
            }

            const retryLong = CacheFinance.getFinanceValueFromLongCache(symbol, attribute);
            if (CacheFinanceUtils.isValidGoogleValue(retryLong)) {
                return retryLong;
            }

            return "#N/A";
        }

        return undefined;
    }

    /**
     * Resolves one CACHEFINANCE() cell. Uses cache instantly when possible and logs only on cache miss.
     * @param {String} symbol
     * @param {String} attribute
     * @param {any} googleFinanceValue
     * @param {Number} webSiteLookupCacheSeconds
     * @returns {any}
     */
    static resolveSingleFinanceData(symbol, attribute, googleFinanceValue, webSiteLookupCacheSeconds = -1) {
        const cachedValue = CacheFinance.tryGetCachedFinanceValue(symbol, attribute, googleFinanceValue);
        if (cachedValue !== undefined) {
            return cachedValue;
        }

        Logger.log(`CACHEFINANCE lookup: ${symbol}=${attribute}. Google=${googleFinanceValue}`);
        return CacheFinance.getBulkFinanceData(
            [symbol],
            attribute,
            [googleFinanceValue],
            webSiteLookupCacheSeconds
        )[0][0];
    }

    /**
     * Optimized path for a single CACHEFINANCE() cell. Reads long cache before any website lookup and
     * avoids short-cache writes when values are unchanged (important for large sheets with hundreds of cells).
     * @param {String} symbol
     * @param {String} attribute
     * @param {any} googleFinanceValue
     * @param {Number} webSiteLookupCacheSeconds
     * @returns {any}
     */
    static getSingleFinanceData(symbol, attribute, googleFinanceValue, webSiteLookupCacheSeconds = -1) {
        return CacheFinance.resolveSingleFinanceData(symbol, attribute, googleFinanceValue, webSiteLookupCacheSeconds);
    }

    /**
     * Returns historical finance data compatible with GOOGLEFINANCE date-range output.
     * @param {String} symbol
     * @param {String} attribute
     * @param {any} googleFinanceValue
     * @param {{startDate: Date, endDate: Date, endDateOrNumDays: any, interval: String}} historicalQuery
     * @param {Number} webSiteLookupCacheSeconds
     * @returns {any[][]|String}
     */
    static getHistoricalFinanceData(symbol, attribute, googleFinanceValue, historicalQuery, webSiteLookupCacheSeconds = -1) {
        const MAX_SHORT_CACHE_SECONDS = 21600;
        const cacheKey = CacheFinanceUtils.makeHistoricalCacheKey(symbol, attribute, historicalQuery);

        if (historicalQuery.singleDay === true && CacheFinanceUtils.isValidGoogleValue(googleFinanceValue)) {
            const series = [[historicalQuery.startDate, googleFinanceValue]];
            const serialized = CacheFinanceUtils.serializeHistoricalSeries(series);
            CacheFinanceUtils.putFinanceValuesIntoShortCache([cacheKey], [serialized], MAX_SHORT_CACHE_SECONDS);
            CacheFinanceUtils.putHistoricalValuesIntoLongCache(cacheKey, serialized);
            return googleFinanceValue;
        }

        if (CacheFinanceUtils.isValidGoogleHistoricalValue(googleFinanceValue)) {
            const serialized = CacheFinanceUtils.serializeHistoricalSeries(googleFinanceValue);
            CacheFinanceUtils.putFinanceValuesIntoShortCache([cacheKey], [serialized], MAX_SHORT_CACHE_SECONDS);
            CacheFinanceUtils.putHistoricalValuesIntoLongCache(cacheKey, serialized);
            return CacheFinanceUtils.formatHistoricalResult(googleFinanceValue, historicalQuery);
        }

        const cachedSeries = CacheFinance.getHistoricalFinanceValueFromShortCache(cacheKey);
        if (cachedSeries !== null) {
            return CacheFinanceUtils.formatHistoricalResult(cachedSeries, historicalQuery);
        }

        const longCachedSeries = CacheFinanceUtils.getHistoricalValuesFromLongCache(cacheKey);
        if (longCachedSeries !== null) {
            return CacheFinanceUtils.formatHistoricalResult(longCachedSeries, historicalQuery);
        }

        const thirdPartySeries = YahooApi.getHistoricalInfo(symbol, attribute, historicalQuery);
        if (CacheFinanceUtils.isValidGoogleHistoricalValue(thirdPartySeries)) {
            const serialized = CacheFinanceUtils.serializeHistoricalSeries(thirdPartySeries);
            const cacheSeconds = webSiteLookupCacheSeconds === -1
                ? CacheFinanceUtils.MAX_HISTORICAL_CACHE_SECONDS
                : webSiteLookupCacheSeconds;
            CacheFinanceUtils.putFinanceValuesIntoShortCache([cacheKey], [serialized], cacheSeconds);
            CacheFinanceUtils.putHistoricalValuesIntoLongCache(cacheKey, serialized);
            return CacheFinanceUtils.formatHistoricalResult(thirdPartySeries, historicalQuery);
        }

        return "#N/A";
    }

    /**
     * @param {String} cacheKey
     * @returns {any[][]|null}
     */
    static getHistoricalFinanceValueFromShortCache(cacheKey) {
        const shortCache = CacheService.getScriptCache();
        const data = shortCache.get(cacheKey);

        if (data !== null && data !== "#ERROR!") {
            Logger.log(`Found historical data in Short CACHE: ${cacheKey}`);
            const parsedData = JSON.parse(data);
            if (CacheFinanceUtils.isValidGoogleHistoricalValue(parsedData)) {
                return CacheFinanceUtils.reviveHistoricalSeries(parsedData);
            }
        }

        return null;
    }

    /**
     * 
     * @param {StockAttributes[]} stockAttributes 
     * @param {String} attribute 
     * @returns 
     */
    static getValuesFromStockAttributes(stockAttributes, attribute) {
        return stockAttributes.map(stockData => stockData.getValue(attribute));
    }

    /**
     * 
     * @param {String[]} symbols 
     * @param {String} attribute 
     * @param {any[]} googleFinanceValues 
     * @returns {any[]}
     */
    static updateMissingValuesFromShortCache(symbols, attribute, googleFinanceValues) {
        //  pulling from short cache is very slow, so if everything is GOOD it can be skipped.
        if (CacheFinance.isAllGoogleDefaultValuesValid(symbols, googleFinanceValues)) {
            return googleFinanceValues;
        }

        const valueFromCache = CacheFinanceUtils.bulkShortCacheGet(symbols, attribute).map(val => val === null ? "#N/A" : val);
        const updatedValues = [];
        const longBackfillSymbols = [];
        const longBackfillValues = [];

        for (let i = 0; i < symbols.length; i++) {
            const hadInvalidDefault = !CacheFinanceUtils.isValidGoogleValue(googleFinanceValues[i]);
            const val = CacheFinanceUtils.isValidGoogleValue(googleFinanceValues[i]) ? googleFinanceValues[i] : valueFromCache[i];

            if (hadInvalidDefault && CacheFinanceUtils.isValidGoogleValue(val)) {
                longBackfillSymbols.push(symbols[i]);
                longBackfillValues.push(val);
            }

            updatedValues.push(val);
        }

        if (longBackfillSymbols.length > 0) {
            CacheFinanceUtils.bulkLongCachePut(longBackfillSymbols, attribute, longBackfillValues);
        }

        return updatedValues;
    }

    /**
     * Fills missing values from long cache when a recent third-party fetch is still valid.
     * @param {String[]} symbols
     * @param {String} attribute
     * @param {any[]} googleFinanceValues
     * @param {Number} cacheSeconds
     * @returns {any[]}
     */
    static updateMissingValuesFromLongCache(symbols, attribute, googleFinanceValues, cacheSeconds) {
        const missingIndices = [];

        for (let i = 0; i < symbols.length; i++) {
            if (!CacheFinanceUtils.isValidGoogleValue(googleFinanceValues[i])) {
                missingIndices.push(i);
            }
        }

        if (missingIndices.length === 0) {
            return googleFinanceValues;
        }

        const missingSymbols = missingIndices.map(index => symbols[index]);
        const longCacheEntries = CacheFinanceUtils.bulkLongCacheGetWithMetadata(missingSymbols, attribute);
        const updatedValues = [...googleFinanceValues];
        const shortCacheKeys = [];
        const shortCacheValues = [];

        for (let i = 0; i < missingIndices.length; i++) {
            const entry = longCacheEntries[i];

            if (!CacheFinanceUtils.isValidGoogleValue(entry?.value)) {
                continue;
            }

            const index = missingIndices[i];
            updatedValues[index] = entry.value;
            shortCacheKeys.push(CacheFinanceUtils.makeCacheKey(symbols[index], attribute));
            shortCacheValues.push(entry.value);
        }

        if (shortCacheKeys.length > 0) {
            CacheFinanceUtils.putFinanceValuesIntoShortCache(shortCacheKeys, shortCacheValues, cacheSeconds);
        }

        return updatedValues;
    }

    /**
     * @param {String[]} symbols
     * @param {String} attribute
     * @returns {String[]}
     */
    static getSymbolsWithoutLongCache(symbols, attribute) {
        const longCacheValues = CacheFinanceUtils.bulkLongCacheGet(symbols, attribute);

        return symbols.filter((_symbol, index) => !CacheFinanceUtils.isValidGoogleValue(longCacheValues[index]));
    }

    /**
     * 
     * @param {String[]} symbols 
     * @param {any[]} googleFinanceValues 
     * @returns {Boolean}
     */
    static isAllGoogleDefaultValuesValid(symbols, googleFinanceValues) {
        if (symbols.length !== googleFinanceValues.length) {
            return false;
        }

        return CacheFinance.getSymbolsWithNoValidData(symbols, googleFinanceValues).length === 0;
    }

    /**
     * 
     * @param {String[]} symbols 
     * @param {any[]} googleFinanceValues 
     * @returns {String[]}
     */
    static getSymbolsWithNoValidData(symbols, googleFinanceValues) {
        const noInfoSymbols = symbols.filter((_sym, i) => !CacheFinanceUtils.isValidGoogleValue(googleFinanceValues[i]));

        // @ts-ignore
        return [... new Set(noInfoSymbols)];
    }

    /**
     * 
     * @param {String[]} symbols 
     * @param {any[]} googleFinanceValues 
     * @param {String[]} symbolsWithNoData 
     * @param {any[]} thirdPartyFinanceValues 
     * @returns {any[]}
     */
    static updateMasterWithMissed(symbols, googleFinanceValues, symbolsWithNoData, thirdPartyFinanceValues) {
        for (let i = 0; i < symbolsWithNoData.length; i++) {
            let startPos = 0;

            while (startPos !== -1) {
                startPos = symbols.indexOf(symbolsWithNoData[i], startPos);
                if (startPos !== -1) {
                    if (CacheFinanceUtils.isValidGoogleValue(thirdPartyFinanceValues[i])) {
                        googleFinanceValues[startPos] = thirdPartyFinanceValues[i];
                    }
                    startPos++;
                }
            }
        }

        return googleFinanceValues;
    }

    /**
     * 
     * @param {String} cacheKey 
     * @returns {any}
     */
    static getFinanceValueFromShortCache(cacheKey) {
        const value = CacheFinance.peekFinanceValueFromShortCache(cacheKey);

        if (value !== null) {
            Logger.log(`Found in Short CACHE: ${cacheKey}. Value=${JSON.stringify(value)}`);
        }

        return value;
    }

    /**
     * @param {String} cacheKey
     * @returns {any|null}
     */
    static peekFinanceValueFromShortCache(cacheKey) {
        const shortCache = CacheService.getScriptCache();
        const data = shortCache.get(cacheKey);

        if (data !== null && data !== "#ERROR!") {
            const parsedData = JSON.parse(data);
            if (!(typeof parsedData === 'string' && (parsedData === "#ERROR!" || parsedData === ""))) {
                return parsedData;
            }
        }

        return null;
    }

    /**
     * @param {String} symbol
     * @param {String} attribute
     * @returns {any|null}
     */
    static getFinanceValueFromLongCache(symbol, attribute) {
        const values = CacheFinanceUtils.bulkLongCacheGet([symbol], attribute);
        return values.length > 0 ? values[0] : null;
    }

    /**
     * 
     * @param {String} symbol 
     * @param {String} attribute 
     */
    static deleteFromCache(symbol, attribute) {
        const key = CacheFinanceUtils.makeCacheKey(symbol, attribute);

        CacheFinance.deleteFromShortCache(key);
        CacheFinance.deleteFromLongCache(key);
    }

    /**
     * 
     * @param {String} key 
     */
    static deleteFromLongCache(key) {
        const longCache = new ScriptSettings();

        const currentLongCacheValue = longCache.get(key);
        if (currentLongCacheValue !== null) {
            longCache.delete(key);
        }
    }

    /**
     * 
     * @param {String} key 
     */
    static deleteFromShortCache(key) {
        const shortCache = CacheService.getScriptCache();

        const currentShortCacheValue = shortCache.get(key);
        if (currentShortCacheValue !== null) {
            shortCache.remove(key);
        }
    }

    /**
     * 
     * @param {String} symbol 
     * @param {String} attribute 
     * @param {String} googleValue 
     * @param {String} cmdOption
     * @returns 
     */
    static backDoorCommands(symbol, attribute, googleValue, cmdOption) {
        const commandStr = googleValue.toString().toUpperCase().trim();
        cmdOption = cmdOption.toString().toUpperCase().trim();

        switch (commandStr) {
            case "":
                return null;

            case "?":
            case "HELP":
                return [["Valid commands in 3'rd parameter.  Erase after run to prevent future runs."],
                ["    ? (display help)"],
                ["    TEST (tests web sites)"],
                ["    CLEARCACHE (remove cache - run again if timeout. If symbol/attribute blank - removes all)"],
                ["    EXPIRECACHE (removes OLD cached items)"],
                ["    REMOVE (pref. site set as do not use site for symbol/attribute)"],
                ["    LIST (show all supported web lookups)"],
                ["    GET (current pref. site for symbol/attribute)"],
                ["    GETBLOCKED (current blocked site for symbol/attribute)"],
                ["    SET (4'th parm is set to pref. site for symbol/attribute)"],
                ["    SETBLOCKED (4'th parm is set to blocked site for symbol/attribute)"]];

            case "TEST":
                return cacheFinanceTest();

            case "CLEARCACHE":
                if (symbol !== "" && attribute !== "") {
                    CacheFinance.deleteFromCache(symbol, attribute);
                }
                else {
                    ScriptSettings.expire(true);
                }
                return 'Cache Cleared';

            case "EXPIRECACHE":
                ScriptSettings.expire(false);
                return 'Old Cache Items Removed';

            case "REMOVE":
                return CacheFinance.removeCurrentProviderAsFavourite(symbol, attribute);

            case "GET":
                return CacheFinance.getCurrentProvider(symbol, attribute);

            case "GETBLOCKED":
                return CacheFinance.getBlockedProvider(symbol, attribute);

            case "SET":
                if (cmdOption !== "" && !CacheFinance.listProviders().includes(cmdOption)) {
                    return "Invalid provider name.  No change made.";
                }
                CacheFinance.setProviderAsFavourite(symbol, attribute, cmdOption);
                return `New provider (${cmdOption}) set as default for: ${symbol} ${attribute}`;

            case "SETBLOCKED":
                if (cmdOption !== "" && !CacheFinance.listProviders().includes(cmdOption)) {
                    return "Invalid provider name.  No change made.";
                }
                CacheFinance.setBlockedProvider(symbol, attribute, cmdOption);
                return `New provider (${cmdOption}) set as blocked for: ${symbol} ${attribute}`;

            case "LIST":
                return CacheFinanceUtils.convertSingleToDoubleArray(CacheFinance.listProviders());

            default:
                return null;
        }
    }

    /**
     * 
     * @param {String} symbol 
     * @param {String} attribute 
     * @returns {String}
     */
    static removeCurrentProviderAsFavourite(symbol, attribute) {
        CacheFinance.deleteFromCache(symbol, attribute);
        let statusMessage = "";

        const bestStockSites = FinanceWebsiteSearch.readBestStockWebsites();
        const objectKey = CacheFinanceUtils.makeCacheKey(symbol, attribute);
        Logger.log(`Removing current site for ${objectKey}`);

        if (bestStockSites[objectKey] === undefined) {
            statusMessage = `Currently no preferred site for ${symbol} ${attribute}`;
        }
        else {
            const badSite = bestStockSites[objectKey];
            statusMessage = `Site removed for lookups: ${badSite}`;
            Logger.log(`Removing site from list: ${badSite}`);
            delete bestStockSites[objectKey];
            bestStockSites[CacheFinanceUtils.makeIgnoreSiteCacheKey(symbol, attribute)] = badSite;
            FinanceWebsiteSearch.writeBestStockWebsites(bestStockSites);
        }

        return statusMessage;
    }

    /**
     * 
     * @param {String} symbol 
     * @param {String} attribute 
     * @param {String} siteName 
     */
    static setProviderAsFavourite(symbol, attribute, siteName) {
        const objectKey = CacheFinanceUtils.makeCacheKey(symbol, attribute);
        CacheFinance.setProviderData(objectKey, siteName);
    }

    /**
     * Sets ONE web provider to NEVER be used for symbol/attribute.
     * @param {String} symbol 
     * @param {String} attribute 
     * @param {String} siteName 
     */
    static setBlockedProvider(symbol, attribute, siteName) {
        const objectKey = CacheFinanceUtils.makeIgnoreSiteCacheKey(symbol, attribute);
        CacheFinance.setProviderData(objectKey, siteName);
    }

    /**
     * 
     * @param {String} objectKey 
     * @param {String} siteName 
     */
    static setProviderData(objectKey, siteName) {
        const bestStockSites = FinanceWebsiteSearch.readBestStockWebsites();
        bestStockSites[objectKey] = siteName;

        if (siteName === "") {
            delete bestStockSites[objectKey];
        }

        FinanceWebsiteSearch.writeBestStockWebsites(bestStockSites);
    }

    /**
     * Returns the PREFERRED web site to find symbol/attribute.
     * @param {String} symbol 
     * @param {String} attribute 
     * @returns {String}
     */
    static getCurrentProvider(symbol, attribute) {
        const objectKey = CacheFinanceUtils.makeCacheKey(symbol, attribute);

        return CacheFinance.getProviderData(objectKey);
    }

    /**
     * Returns the web site provider that is never used to access symbol/attribute.
     * @param {String} symbol 
     * @param {String} attribute 
     * @returns {String}
     */
    static getBlockedProvider(symbol, attribute) {
        const objectKey = CacheFinanceUtils.makeIgnoreSiteCacheKey(symbol, attribute);

        return CacheFinance.getProviderData(objectKey);
    }

    /**
     * 
     * @param {String} objectKey 
     * @returns {String}
     */
    static getProviderData(objectKey) {
        let currentSite = "No site set.";
        const bestStockSites = FinanceWebsiteSearch.readBestStockWebsites();

        if (bestStockSites[objectKey] !== undefined) {
            currentSite = bestStockSites[objectKey];
        }

        return currentSite;
    }

    /**
     * Returns all web site ID's used to retrieve stock info.
     * @returns {String[]}
     */
    static listProviders() {
        const webSites = new FinanceWebSites();

        const siteNames = webSites.siteList.map(site => site._siteName);

        return siteNames;
    }
}