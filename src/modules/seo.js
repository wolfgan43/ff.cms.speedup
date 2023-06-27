import fs from 'fs';
import path from 'path';
import {CHARSET, project, SEP} from '../constant.js';
import HTMLParser from 'node-html-parser';
import {minify as HTMLMinifier} from 'html-minifier-terser';
import * as css from './seo/css.js';
import * as clone from './clone.js';
import {Log, Stats} from './log.js';
import * as js from "./seo/js.js";
import * as prettier from "prettier";
import * as image from "./seo/image.js";
import {Page} from "./page.js";
import {crawler} from "./crawler.js";

const printArray = (array => {
    return `\n  ${array.join("\n  ")}`;
});
export function seo(urls) {
    const defaultOptions = {
        img: {
            lazy: true,
            alt: true,
            title: true,
            webp: true,
            compress: true,
            progressive: true,
        },
        css: {
            async: false,
            combine: false,
            critical: false,
            minify: false,
        },
        js: {
            async: false
        }
    };
    const buffer = {
        assets: {},
        map: {},
        css: {},
        html: {},
        link: {
            internal: {},
            external: {}
        }
    };

    const change = (files, type) => {
        const changeOne = (fileDst, fileSrc = null) => {
            const replacements = (buffer[type][fileSrc]
                    ? {fileSrc: buffer[type][fileSrc]}
                    : buffer[type]
            );

            let fileContent = fs.readFileSync(fileDst, CHARSET);
            for (const origin in replacements) {
                fileContent = changeData(fileContent, replacements[origin]);
            }
            fs.writeFileSync(fileDst, fileContent, CHARSET);
        }

        if (!Array.isArray(files)) {
            files = [files];
        }

        files.forEach((file) => {
            changeOne(file, buffer.map[file]);
        });
    };

    const changeData = (content, replacements) => {
        for (const src in replacements) {
            content = content.replaceAll(src, replacements[src]);
        }

        return content;
    }
    const optimize = async (page, options) => {
        const onRetrieveAssets = (assets, dom) => {
            const setWebUrl = (url, defaultExt = null, defaultFilename = null) => {
                return (options.preview
                    ? page.local.getWebUrl(url, defaultExt, defaultFilename)
                    : url
                );
            }
            const setDomElem = (urls, onDomElem) => {
                for (const url of Array.isArray(urls) ? urls : [urls]) {
                    assets.dom[url] && assets.dom[url].forEach((asset) => {
                        onDomElem(asset.domElem, asset.attrName);
                    });
                }
            };
            const getRelativePath = (assetWebUrl, souceFileWebUrl) => {
                const assetParts = assetWebUrl.split(SEP);
                const sourceParts = souceFileWebUrl.split(SEP);

                // Rimuovi le parti comuni tra il percorso assoluto e il percorso di riferimento
                while (assetParts[0] === sourceParts[0]) {
                    assetParts.shift();
                    sourceParts.shift();
                }

                // Crea il percorso relativo utilizzando i punti di sospensione (..)
                return sourceParts
                    .map(() => '..')
                    .concat(assetParts)
                    .join(SEP);
            };
            const setSource = (assetFilePath, assetWebUrl) => {
                assets.source[assetFilePath] && assets.source[assetFilePath].forEach((data) => {
                    const type = (data.sourceFile.endsWith(".css")
                        ? "css"
                        : "html"
                    );

                    if (!buffer[type][data.sourceFile]) {
                        buffer[type][data.sourceFile] = {};
                    }
                    buffer[type][data.sourceFile][data.src] = getRelativePath(assetWebUrl, page.src.getWebUrl(path.dirname(data.sourceFile)));
                });
            }
            const scripts = async () => {
                Log.debug(`- OPTIMIZE JS`);
                if (options.js.combine) {
                    /**
                     * Combine Javascript
                     */
                    Log.write(`- JS Combine: ${printArray(assets.scripts)}`, page.dist.filePath);
                    const combinedScript = js.combine(assets.scripts);
                    Log.write(`- JS Combine Size: (${combinedScript.length} bytes)`, page.dist.filePath);

                    const scriptAsync = (
                        options.js.async
                            ? ` defer="defer" async="async"`
                            : ` defer="defer"`
                    );
                    /**
                     * Html: Remove scripts
                     */
                    Log.write(`- JS Remove Scripts: ${printArray(assets.scripts)}`, page.dist.filePath);
                    setDomElem(assets.scripts, (domElem) => {
                        domElem.remove();
                    });

                    /**
                     * Purge combinedScript
                     */
                    let scriptPurged = (
                        options.js.purge
                            ? combinedScript
                            : combinedScript
                    );

                    /**
                     * Save combinedScript
                     */
                    const scriptFilePath = js.save({
                        script: scriptPurged,
                        filename: page.name + page.pathName.replaceAll(SEP, "-"),
                        basePath: page.dist.rootDir,
                        min: options.js.minify,
                    });
                    Log.write(`- JS Combine Save${options.js.minify ? ' (Minified)' : ''}:  ${scriptFilePath}`, page.dist.filePath);

                    /**
                     * Html: Add Combined Script
                     */
                    const scriptUrl = page.dist.getWebUrl(scriptFilePath);
                    Log.write(`- HTML Add JS Combine${scriptAsync ? ' (Async)' : ''}: ${scriptUrl}`, page.dist.filePath);
                    dom.querySelector("head").appendChild(HTMLParser.parse(
                        `<script src="${setWebUrl(scriptUrl)}"${scriptAsync}></script>`
                    ));
                } else {
                    if (options.js.minify) {
                        js.min(assets.scripts, (script) => {
                            //todo: da fare meglio questi percorsi (da cercarli in giro: eliminare .replace(page.sourceRoot, "")): page.dist.getFilePath(script.replace(page.sourceRoot, ""));
                            const dst = page.dist.getFilePath(script);
                            /**
                             * Write buffer scriptDst => scriptSrc
                             */
                            buffer.map[dst] = script;
                            return dst;
                        });
                    } else {
                        await cp(["scripts"], (dst, src) => {
                            /**
                             * Write buffer scriptDst => scriptSrc
                             */
                            buffer.map[dst] = src;

                            return dst;
                        });
                    }

                    /**
                     * Purge Scripts
                     */
                    if (options.js.purge) {
                        //todo: da implementare
                    }

                    /**
                     * Html: change Scripts reg
                     */
                    Log.write(`- JS Change Scripts${options.js.async ? " Defer": ""}${options.js.minify ? ", Minified": ""}: ${printArray(assets.scripts)}`, page.dist.filePath);
                    setDomElem(assets.scripts, (domElem, attrName) => {
                        let url = domElem.getAttribute(attrName);

                        /**
                         * Html: set min Extension Scripts
                         */
                        if (options.js.minify && !url.endsWith(".min.js")) {
                            url = url.replace(".js", ".min.js");
                        }
                        if (!url.startsWith("http")) {
                            domElem.setAttribute(attrName, setWebUrl(url));
                        }

                        /**
                         * Html: set Defer Scripts
                         */
                        if(options.js.async) {
                            //todo: convertire in base64 gli script inline se gia non sono async
                            domElem.setAttribute("defer", "defer");
                        }
                    });
                }
            };
            const stylesheets = async () => {
                const onLoadCSS         = "if(media!='all')media='all'";

                Log.debug(`- OPTIMIZE CSS`);
                if (options.css.combine) {
                    /**
                     * Combine StyleSheets
                     */
                    Log.write(`- CSS Combine: ${printArray(assets.stylesheets)}`, page.dist.filePath);
                    const stylesheetAsync = (
                        options.css.async || options.css.critical
                            ? ` media="print" onload="${onLoadCSS}"`
                            : ''
                    );
                    const combinedStylesheet = css.combine(assets.stylesheets);
                    Log.write(`- CSS Combine Size: (${combinedStylesheet.length} bytes)`, page.dist.filePath);

                    /**
                     * Critical CSS
                     * unCritical CSS
                     */
                    let stylesheetUncritical = (
                        options.css.critical
                            ? await css.critical({
                                srcFilePath: page.url,
                                stylesheets: assets.stylesheets,
                            }).then(({css, uncritical}) => {
                                Log.write(`- HTML Add Critical Style Inline: (${css.length} bytes)`, page.dist.filePath);
                                dom.querySelector("head").appendChild(HTMLParser.parse(
                                    `<style>${css}</style>`
                                ));

                                return uncritical;
                            }).catch((err) => {
                                console.error(err);
                                process.exit(0);
                            })
                            : combinedStylesheet
                    );
                    Log.write(`- CSS Combine unCritical: (${stylesheetUncritical.length} bytes)`, page.dist.filePath);

                    /**
                     * Html: Remove stylesheets
                     */
                    Log.write(`- CSS Remove Stylesheets: ${printArray(assets.stylesheets)}`, page.dist.filePath);
                    setDomElem(assets.stylesheets, (domElem) => {
                        domElem.remove();
                    });

                    /**
                     * Purge unCritical
                     */
                    if (options.css.purge) {
                        stylesheetUncritical = await css.purgeStyle({
                            html: dom.toString(),
                            style: stylesheetUncritical,
                            safeClasses: options.css.purge.safeClasses,
                            blockClasses: options.css.purge.blockClasses,
                        }).then((stylesheet) => {
                            Log.write(`- CSS Combine Purge: (${stylesheet.length} bytes)`, page.dist.filePath);
                            return stylesheet;

                        }).catch((err) => {
                            console.error(err);
                            process.exit(0);
                        });
                    }

                    /**
                     * Save unCritical CSS
                     */
                    const stylesheetFilePath = css.save({
                        stylesheet: stylesheetUncritical,
                        filename: page.name + page.pathName.replaceAll(SEP, "-"),
                        basePath: page.dist.rootDir,
                        min: options.css.minify || options.css.critical,
                    });
                    Log.write(`- CSS Combine Save${options.css.minify ? ' (Minified)' : ''}: ${stylesheetFilePath}`, page.dist.filePath);

                    /**
                     * Html: Add unCritical CSS
                     */
                    const stylesheetUrl = page.dist.getWebUrl(stylesheetFilePath);
                    Log.write(`- HTML Add CSS Combine${stylesheetAsync ? ' (Async)' : ''}: ${stylesheetUrl}`, page.dist.filePath);
                    dom.querySelector("head").appendChild(HTMLParser.parse(
                        `<link rel="stylesheet" href="${setWebUrl(stylesheetUrl)}"${stylesheetAsync}/>`
                    ));
                } else {
                    /**
                     * Critical CSS
                     */
                    if (options.css.critical) {
                        await css.critical({
                            srcFilePath: page.url,
                            stylesheets: assets.stylesheets,
                        }).then(({css}) => {
                            Log.write(`- HTML Add Critical Style Inline: (${css.length} bytes)`, page.dist.filePath);
                            dom.querySelector("head").appendChild(HTMLParser.parse(
                                `<style>${css}</style>`
                            ));
                        }).catch((err) => {
                            console.error(err);
                            process.exit(0);
                        });
                    }

                    /**
                     * Minify CSS
                     */
                    if (options.css.minify) {
                        css.min(assets.stylesheets, (stylesheetMin, stylesheet) => {
                            const dst = page.dist.getFilePath(stylesheetMin);
                            /**
                             * Write buffer stylesheetDst => stylesheetSrc
                             */
                            buffer.map[dst] = stylesheet;
                            return dst;
                        });
                    } else {
                        await cp(["stylesheets"], (dst, src) => {
                            /**
                             * Write buffer stylesheetDst => stylesheetSrc
                             */
                            buffer.map[dst] = src;

                            return dst;
                        });
                    }

                    /**
                     * Html: change StyleSheets Ref
                     */
                    Log.write(`- CSS Change Stylesheets${options.css.async ? " Async": ""}${options.css.minify ? ", Minified": ""}: ${printArray(assets.stylesheets)}`, page.dist.filePath);
                    setDomElem(assets.stylesheets, (domElem, attrName) => {
                        let url = domElem.getAttribute(attrName);

                        /**
                         * Html: set min Extension StyleSheets
                         */
                        if (options.css.minify && !url.endsWith(".min.css")) {
                            url = url.replace(".css", ".min.css");
                        }
                        if (!url.startsWith("http")) {
                            domElem.setAttribute(attrName, setWebUrl(url));
                        }

                        /**
                         * Html: set Async StyleSheets
                         */
                        if(options.css.async) {
                            domElem.setAttribute("media", "print");
                            domElem.setAttribute("onLoad", onLoadCSS);
                        }
                    });
                }
            };
            const images = async () => {
                //console.log(`file://${process.cwd()}/` + urlHtml.substr(1));
                //await image.setRenderedDimensions(`file://${process.cwd()}/` + urlHtml.substr(1));
                //process.exit(0);
                for (const img of assets.images) {
                    if (!Stats.isset(img, "images")) {
                        Stats.save(img, "images", -1);
                        if (fs.existsSync(img)) {
                            const imgOptimized = image.optimize(img, options.img);
                            const imageFilePath = path.dirname(page.dist.getFilePath(img)) + SEP + imgOptimized.imageBaseName;
                            const imageWebUrl = page.dist.getWebUrl(imageFilePath);
                            /**
                             * Write buffer img: new dst, metadata
                             */
                            buffer.assets[img] = {
                                dst: imageWebUrl,
                                metadata: imgOptimized.metadata
                            };

                            /**
                             * Write buffer foreach sourceFile (stylesheet, html)
                             */
                            setSource(img, imageWebUrl);

                            clone.saveData(imageFilePath, await imgOptimized.buffer, "imagesOptimized");
                        } else {
                            Log.error(`- ASSET: Not Found (${img}) --> ${page.url}`, page.dist.filePath);
                        }
                    }

                    /**
                     * Set foreach Image and foreach Page setDomElem
                     */
                    setDomElem(img, (domElem, attrName) => {
                        if (buffer.assets[img]) {
                            Log.write(`- HTML Change Image${options.img.lazy ? " Lazy": ""}: ${buffer.assets[img].dst}`, page.dist.filePath);

                            domElem.setAttribute(attrName, setWebUrl(buffer.assets[img].dst));

                            /**
                             * Set Image Width, Height
                             */
                            if (buffer.assets[img].metadata && domElem.tagName === "IMG" && !domElem.getAttribute('width')) {
                                buffer.assets[img].metadata.then(metadata => {
                                    domElem.setAttribute('width', metadata.width);
                                    domElem.setAttribute('height', "auto");
                                });
                            }

                            /**
                             * Lazy Image
                             */
                            if (options.img.lazy && domElem.tagName === "IMG") {
                                domElem.setAttribute("loading", "lazy");
                            }
                        } else {
                            Log.error(` - IMAGE noBuffer: ${img}`);
                        }
                    });
                }
            }

            const icons = async () => {
                for (const icon of assets.icons) {
                    if (!Stats.isset(icon, "icons")) {
                        Stats.save(icon, "icons", -1);
                        if(fs.existsSync(icon)) {
                            const imgOptimized = image.optimize(icon, options.img);
                            const imageFilePath = path.dirname(page.dist.getFilePath(icon)) + SEP + imgOptimized.imageBaseName;
                            const imageWebUrl = page.dist.getWebUrl(imageFilePath);
                            /**
                             * Write buffer img: new dst, metadata
                             */
                            buffer.assets[icon] = {
                                dst: imageWebUrl,
                                metadata: null
                            };

                            /**
                             * Write buffer foreach sourceFile (stylesheet, html)
                             */
                            setSource(icon, imageWebUrl);

                            clone.saveData(imageFilePath, await imgOptimized.buffer, "iconsOptimized");
                        } else {
                            Log.error(`- ASSET: Not Found (${icon}) --> ${page.url}`, page.dist.filePath);
                        }
                    }

                    /**
                     * Set foreach Image and foreach Page setDomElem
                     */
                    setDomElem(icon, (domElem, attrName) => {
                        if (buffer.assets[icon]) {
                            domElem.setAttribute(attrName, setWebUrl(buffer.assets[icon].dst));

                            if (buffer.assets[icon].metadata && domElem.tagName === "IMG" && !domElem.getAttribute('width')) {
                                buffer.assets[icon].metadata.then(metadata => {
                                    domElem.setAttribute('width', metadata.width);
                                    domElem.setAttribute('height', "auto");
                                });
                            }
                        }
                    });
                }
            }

            const cp = async (assetTypes, onSaveData = null) => {
                for(const type of assetTypes) {
                    for (const asset of assets[type]) {
                        if (!Stats.isset(asset, type)) {
                            Stats.save(asset, type, -1);
                            if (fs.existsSync(asset)) {
                                const dst = page.dist.getFilePath(asset);

                                /**
                                 * Write buffer foreach sourceFile (stylesheet, html)
                                 */
                                setSource(asset, page.dist.getWebUrl(dst));

                                clone.saveFile((onSaveData ? onSaveData(dst, asset) : dst), asset, type + "Optimized");
                            } else {
                                Log.error(`- ASSET: Not Found (${asset}) --> ${page.url}`, page.dist.filePath);
                            }
                        }
                    }
                }
            }

            return Promise.all([
                scripts(),
                stylesheets(),
                images(),
                icons(),
                cp(["fonts", "audios", "videos", "others"])
            ]).then(() => {
                Log.write(`- HTML Save: ${page.url} --> ${page.dist.filePath}`, page.dist.filePath);

                setDomElem(assets.html, (domElem, attrName) => {
                    const href = domElem.getAttribute(attrName);

                    domElem.setAttribute(attrName, setWebUrl(href, ".html", "index"))
                });

                const html = changeData(pageCrawled.dom.toString(), buffer.html[page.url] || []);
                const minifyOptions = {
                    collapseWhitespace: true,
                    removeComments: true,
                    removeRedundantAttributes: true,
                    removeEmptyAttributes: true,
                    removeScriptTypeAttributes: true,
                    removeStyleLinkTypeAttributes: true,
                    minifyCSS: true,
                    minifyJS: true
                };
                return (options.html.minify
                        ? HTMLMinifier(html, minifyOptions).then(html => {
                            return clone.saveData(page.dist.filePath, html, "htmlOptimized");
                        })
                        : clone.saveData(page.dist.filePath, prettier.format(html, { parser: 'html' }), "htmlOptimized")
                )
            }).catch(err => {
                console.error(err);
                process.exit(0);
            });
        };

        Log.debug(`SEO SPEEDUP: ${page.url}`);
        Log.write(`- HTML Dom Loaded: ${page.url}`, page.dist.filePath);

        const pageCrawled = crawler(page).scrape({
            attrAssetMap: options.attrAssetMap,
        });

        return onRetrieveAssets(pageCrawled.assets, pageCrawled.dom);
    }
    const publics = {
        speedUp: (options = defaultOptions) => {
            let promises = [];

            clone.deleteProject("dist");
            Stats.clean();
            Log.clean(true);

            urls.forEach((url) => {
                promises.push(optimize(new Page(url), options));
            });

            return Promise.all(promises).then(() => {
                const stylesheets = Stats.get("stylesheetsOptimized");

                change(stylesheets, "css");

                /**
                 * Purge CSS
                 */
                if (!options.css.combine && options.css.purge) {
                    css.purgeFiles({
                        contents: Stats.get("htmlOptimized"),
                        stylesheets: stylesheets,
                        safeClasses: options.css.purge.safeClasses,
                        blockClasses: options.css.purge.blockClasses
                    }).then(() => {
                        Log.write(`CSS Purge Stylesheets: ${printArray(stylesheets)}`);
                        Stats.log("speedup"); //todo: da togliere
                        Log.report(`SpeedUp! (stored in ${project.distPath()})`); //todo: da togliere
                    }).catch((err) => {
                        console.error(err);
                        process.exit(0);
                    });
                } else {
                    Stats.log("speedup");
                    Log.report(`SpeedUp! (stored in ${project.distPath()})`); //todo: da togliere
                }

                return publics;
            }).catch(err => {
                console.error(err);
                process.exit(0);
            });
        }
    };

    return publics;
}