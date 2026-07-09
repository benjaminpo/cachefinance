import { describe, expect, it } from "vitest";
import { CacheFinanceUtils } from "../src/CacheFinanceUtils.js";

describe("CacheFinanceUtils", () => {
    it("builds uppercase cache keys from symbol and attribute", () => {
        expect(CacheFinanceUtils.makeCacheKey("tse:ztl", "price")).toBe("PRICE|TSE:ZTL");
    });

    it("builds ignore-site cache keys", () => {
        expect(CacheFinanceUtils.makeIgnoreSiteCacheKey("TSE:ZTL", "price"))
            .toBe("IGNORE|PRICE|TSE:ZTL");
    });

    it("creates cache keys for each symbol in a list", () => {
        expect(CacheFinanceUtils.createCacheKeyList(["tse:a", "neo:b"], "yieldpct"))
            .toEqual(["YIELDPCT|TSE:A", "YIELDPCT|NEO:B"]);
    });

    it.each([
        [42, true],
        ["123.45", true],
        [null, false],
        [undefined, false],
        ["#N/A", false],
        ["#ERROR!", false],
        ["", false]
    ])("isValidGoogleValue(%s) returns %s", (value, expected) => {
        expect(CacheFinanceUtils.isValidGoogleValue(value)).toBe(expected);
    });

    it("removes trailing blank rows from sheet data", () => {
        const table = [
            ["TSE:ZTL", "10"],
            ["", ""],
            ["", ""]
        ];

        expect(CacheFinanceUtils.removeEmptyRecordsAtEndOfTable(table))
            .toEqual([["TSE:ZTL", "10"]]);
    });

    it("converts a column from a 2D range into a flat array", () => {
        const range = [["A"], ["B"], ["C"]];
        expect(CacheFinanceUtils.convertRowsToSingleArray(range, 0))
            .toEqual(["A", "B", "C"]);
    });

    it("converts a flat array into a 2D column range", () => {
        expect(CacheFinanceUtils.convertSingleToDoubleArray(["A", "B"]))
            .toEqual([["A"], ["B"]]);
    });

    it("stores and retrieves values from the short cache in bulk", () => {
        const keys = ["PRICE|TSE:ZTL", "PRICE|NEO:CJP"];
        const values = [12.34, 56.78];

        CacheFinanceUtils.putFinanceValuesIntoShortCache(keys, values, 1200);
        expect(CacheFinanceUtils.getFinanceValuesFromShortCache(keys))
            .toEqual(values);
    });

    it("skips invalid values when writing to the short cache", () => {
        const keys = ["PRICE|TSE:ZTL", "PRICE|NEO:CJP"];
        const values = ["#N/A", 10.5];

        CacheFinanceUtils.putFinanceValuesIntoShortCache(keys, values, 1200);
        expect(CacheFinanceUtils.getFinanceValuesFromShortCache(keys))
            .toEqual([null, 10.5]);
    });

    it("stores and retrieves values from the long cache in bulk", () => {
        CacheFinanceUtils.bulkLongCachePut(["TSE:A", "TSE:B"], "PRICE", [10, "#N/A"], 1);

        expect(CacheFinanceUtils.bulkLongCacheGet(["TSE:A", "TSE:B"], "PRICE"))
            .toEqual([10, null]);
    });

    it("removes all short-cache entries for the requested symbols", () => {
        CacheFinanceUtils.bulkShortCachePut(["TSE:A"], "PRICE", [10], 1200);
        CacheFinanceUtils.bulkShortCacheRemoveAll(["TSE:A"], "PRICE");

        expect(CacheFinanceUtils.bulkShortCacheGet(["TSE:A"], "PRICE")).toEqual([null]);
    });

    it("returns non-array inputs unchanged from range helpers", () => {
        expect(CacheFinanceUtils.removeEmptyRecordsAtEndOfTable("not-an-array")).toBe("not-an-array");
        expect(CacheFinanceUtils.convertRowsToSingleArray("not-an-array")).toBe("not-an-array");
    });

    it("builds historical queries from GOOGLEFINANCE-style parameters", () => {
        const start = new Date("2024-01-01T00:00:00.000Z");
        const end = new Date("2024-01-31T00:00:00.000Z");

        const query = CacheFinanceUtils.buildHistoricalQuery(start, end, "WEEKLY");
        expect(query?.interval).toBe("WEEKLY");
        expect(CacheFinanceUtils.formatDateForCacheKey(query?.startDate)).toBe("2024-01-01");
        expect(CacheFinanceUtils.formatDateForCacheKey(query?.endDate)).toBe("2024-01-31");
    });

    it("resolves num_days into an end date", () => {
        const start = new Date("2024-01-01T00:00:00.000Z");
        const query = CacheFinanceUtils.buildHistoricalQuery(start, 14, "DAILY");

        expect(CacheFinanceUtils.formatDateForCacheKey(query?.endDate)).toBe("2024-01-15");
    });

    it("normalizes interval aliases", () => {
        expect(CacheFinanceUtils.normalizeHistoricalInterval("1")).toBe("DAILY");
        expect(CacheFinanceUtils.normalizeHistoricalInterval("weekly")).toBe("WEEKLY");
        expect(CacheFinanceUtils.normalizeHistoricalInterval("")).toBe("DAILY");
    });

    it("builds historical cache keys", () => {
        const query = CacheFinanceUtils.buildHistoricalQuery(
            new Date("2024-01-01T00:00:00.000Z"),
            new Date("2024-01-31T00:00:00.000Z"),
            "DAILY"
        );

        expect(CacheFinanceUtils.makeHistoricalCacheKey("nasdaq:aapl", "close", query))
            .toBe("HIST|CLOSE|NASDAQ:AAPL|2024-01-01|2024-01-31|DAILY");
    });

    it("validates and revives historical series values", () => {
        const series = [
            [new Date("2024-01-01T00:00:00.000Z"), 100],
            [new Date("2024-01-02T00:00:00.000Z"), 101]
        ];

        expect(CacheFinanceUtils.isValidGoogleHistoricalValue(series)).toBe(true);
        expect(CacheFinanceUtils.isValidGoogleHistoricalValue("#N/A")).toBe(false);

        const serialized = CacheFinanceUtils.serializeHistoricalSeries(series);
        const revived = CacheFinanceUtils.reviveHistoricalSeries(serialized);
        expect(revived?.[0][1]).toBe(100);
        expect(revived?.[0][0]).toBeInstanceOf(Date);
    });
});
