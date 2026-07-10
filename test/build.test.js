import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
    buildCacheFinanceBundle,
    buildCacheFinanceMinBundle,
    enableDebugExports,
    hashSections,
    isCacheFinanceBundleCurrent,
    paths,
    stripDebugBlocks,
    validateBundleContent,
    writeCacheFinanceBundle
} from "../scripts/gas-source.mjs";

describe("gas-source transforms", () => {
    it("removes DEBUG blocks from source files", () => {
        const source = `/*  *** DEBUG START ***
// import { Foo } from "./Foo.js";
// export { Bar };
//  *** DEBUG END ***/

class Bar {}`;

        expect(stripDebugBlocks(source)).toBe("class Bar {}");
    });

    it("uncomments DEBUG exports for Node tests", () => {
        const source = `/*  *** DEBUG START ***
//  Remove comments for testing in NODE
// export { Widget };
//  *** DEBUG END ***/

class Widget {}`;

        const transformed = enableDebugExports(source);
        expect(transformed).toContain("export { Widget };");
        expect(transformed).toContain("class Widget {}");
    });

    it("creates stable hashes for unchanged source sections", () => {
        const sections = ["class A {}", "class B {}"];
        expect(hashSections(sections)).toBe(hashSections([...sections]));
    });
});

describe("cachefinance bundle", () => {
    it("builds a valid Apps Script bundle", () => {
        const { bundle, sourceHash, sectionCount } = buildCacheFinanceBundle();

        expect(sectionCount).toBe(6);
        expect(sourceHash).toMatch(/^[a-f0-9]{12}$/);
        expect(bundle).toContain(`Source hash: ${sourceHash}`);
        expect(bundle).toContain("function CACHEFINANCE");
        expect(bundle).toContain("class CacheFinanceUtils");
        expect(() => validateBundleContent(bundle)).not.toThrow();
    });

    it("excludes optional Apps Script test helpers from the bundle", () => {
        const { bundle } = buildCacheFinanceBundle();

        expect(bundle).not.toContain("function testYieldPct");
        expect(bundle).not.toContain("function testCacheFinances");
        expect(bundle).not.toContain("function testUpdateMaster");
    });

    it("builds a valid minified Apps Script bundle", () => {
        const { bundle, sourceHash } = buildCacheFinanceBundle();
        const minBundle = buildCacheFinanceMinBundle(bundle, sourceHash);

        expect(minBundle).toContain(`Source hash: ${sourceHash}`);
        expect(minBundle).toContain("function CACHEFINANCE");
        expect(minBundle).toContain("class CacheFinanceUtils");
        expect(minBundle.length).toBeLessThan(bundle.length);
        expect(() => validateBundleContent(minBundle)).not.toThrow();
    });

    it("writes dist bundles only when content changes", () => {
        const first = writeCacheFinanceBundle();
        const second = writeCacheFinanceBundle();

        expect(fs.existsSync(paths.dist)).toBe(true);
        expect(fs.existsSync(paths.distMin)).toBe(true);
        expect(first.bundle).toBe(second.bundle);
        expect(first.minBundle).toBe(second.minBundle);
        expect(isCacheFinanceBundleCurrent()).toBe(true);
    });
});
