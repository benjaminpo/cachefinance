#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    isCacheFinanceBundleCurrent,
    paths,
    SOURCE_FILES,
    writeCacheFinanceBundle
} from "./gas-source.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

/**
 * Format a byte count for CLI output.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
    return `${bytes.toLocaleString()} bytes`;
}

/**
 * Build or verify the Apps Script bundle from source modules.
 */
function main() {
    if (checkOnly) {
        if (isCacheFinanceBundleCurrent()) {
            // skipcq: JS-0002
            console.log(
                `dist/CacheFinance.js and dist/CacheFinance.min.js are up to date ` +
                `(${SOURCE_FILES.length} source files)`
            );
            return;
        }

        console.error("dist bundles are out of date. Run: npm run build");
        process.exit(1);
    }

    const result = writeCacheFinanceBundle();
    const distLabel = path.relative(paths.root, paths.dist);
    const minDistLabel = path.relative(paths.root, paths.distMin);

    if (result.written || result.minWritten) {
        // skipcq: JS-0002
        console.log(
            `Built ${distLabel} (${formatBytes(result.bytes)}, ` +
            `${result.sectionCount} files, hash ${result.sourceHash})`
        );
        // skipcq: JS-0002
        console.log(`Built ${minDistLabel} (${formatBytes(result.minBytes)})`);
        return;
    }

    // skipcq: JS-0002
    console.log(
        `${distLabel} and ${minDistLabel} are up to date ` +
        `(${formatBytes(result.bytes)} / ${formatBytes(result.minBytes)}, hash ${result.sourceHash})`
    );
}

const scriptPath = path.resolve(fileURLToPath(import.meta.url));

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
    main();
}
