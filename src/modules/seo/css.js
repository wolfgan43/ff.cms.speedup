import fs from 'fs';
import path from 'path';
import {PurgeCSS} from 'purgecss'
import * as clone from '../clone.js';
import {generate} from "critical";
import CleanCSS from "clean-css";

import {
    CHARSET,
    CSS_PATH,
    CSS_REGEXP,
    HTML_REGEXP,
    SEP,
} from '../../constant.js';
import {Log, Stats} from "../log.js";


export async function purgeStyle({
                           html,
                           style,
                           safeClasses     = [],
                           blockClasses    = []
                       }) {

    return await new PurgeCSS().purge({
        content: [{
            raw: html,
            extension: 'html'
        }],
        css: [{
            raw: style
        }],
        fontFace: true,
        keyframes: true,
        variables: true,
        rejected: false,
        rejectedCss: false,
        safelist: safeClasses,
        blocklist: blockClasses,
    }).then((ResultPurge) => {
        let stylesheet = '';
        ResultPurge.forEach((result) => {
            stylesheet += result.css;
        });

        return stylesheet;
    });
}
export async function purgeFiles({
                          rootDir,
                          html             = null,
                          contents         = null,
                          stylesheets      = null,
                          safeClasses      = [],
                          blockClasses     = [],
                          onSaveData       = null
                      }) {
    return await new PurgeCSS().purge({
            content: (
                html
                ? [{
                    raw: html,
                    extension: 'html'
                }]
                : contents || [rootDir + HTML_REGEXP]
            ),
            css: (
                stylesheets
                ? Stats.diffKeys(stylesheets, "stylesheetsPurged")
                : [rootDir + CSS_REGEXP]
            ),
            fontFace: true,
            keyframes: true,
            variables: true,
            rejected: false,
            rejectedCss: false,
            safelist: safeClasses,
            blocklist: blockClasses,
        }).then((ResultPurge) => {
            let cssFiles        = [];

            ResultPurge.forEach((result) => {
                const dstFilePath = (onSaveData ? onSaveData(result.file) : result.file);
                cssFiles.push(dstFilePath);
                clone.saveData(dstFilePath, result.css, "stylesheetsPurged");
            });

            return cssFiles;
        })
}

export async function critical({
                             srcFilePath,
                             stylesheets
                         }) {
    return generate({
        // Inline the generated critical-path CSS
        // - true generates HTML
        // - false generates CSS
        inline: false,

        // Your base directory
        //base: projectPath,

        // HTML source
        //html: '<html>...</html>',

        // HTML source file
        src: srcFilePath,

        // Your CSS Files (optional)
        css: stylesheets,
        //target: {
        //         css: 'critical.css',
        //         uncritical: 'uncritical.css',
        //     },
        // Viewport width
        width: 1200,
        // Viewport height
        height: 1050,
        dimensions: [
            {
                width: 576,
            },
            {
                width: 768,
            },
            {
                width: 992,
            },
            {
                width: 1200,
            },
            {
                width: 1400,
            },
        ],
        // Output results to file

        /*rebase: {
            from: '/styles/main.css',
            to: '/folder/subfolder/index.html',
        },*/
        /*
        rebase: (asset) => `https://my-cdn.com/${asset.absolutePath}`,
        rebase: (asset) => `/${asset.absolutePath}`,
         */
        rebase: (asset) => `${asset.url}`,

        // Extract inlined styles from referenced stylesheets
        extract: true,

        // ignore CSS rules
        ignore: {
            atrule: ['@font-face'],
            decl: (node, value) => /url\(/.test(value),
        },
    });
}

function minify(css) {
    return new CleanCSS().minify(css).styles;
}

export function combine(stylesheets) {
    let css = "";

    stylesheets.forEach((stylesheet) => {
        css += fs.readFileSync(stylesheet, {encoding: CHARSET});
    });

    return css;
}

export function min(stylesheets, onSaveData = null) {
    for (const stylesheet of Stats.diffKeys(stylesheets, "stylesheets")) {
        Stats.save(stylesheet, "stylesheets", -1);

        if (stylesheet.startsWith("http")) {
            throw new Error("Can't minify remote file");
        }

        let minified = fs.readFileSync(stylesheet, {encoding: CHARSET});
        let stylesheetMin = stylesheet;

        if (path.basename(stylesheet).indexOf(".min.css") < 0) {
            minified = minify(minified);
            stylesheetMin = stylesheetMin.replace(".css", ".min.css");
        }
        const stylesheetFilePath = (onSaveData ? onSaveData(stylesheetMin, stylesheet) : stylesheetMin);

        Log.write(`CSS Save Minified: ${stylesheet} --> ${stylesheetFilePath}`);
        clone.saveData(stylesheetFilePath, minified, "stylesheetsOptimized");
    }
}


export function save({stylesheet, filename, basePath, min = true}) {
    const cssFilePath    = basePath + CSS_PATH + SEP + filename + (min ? ".min" : "") + ".css";

    clone.saveData(cssFilePath,
        min
            ? minify(stylesheet)
            : stylesheet
        , "stylesheetsOptimized"
    );

    return cssFilePath;
}