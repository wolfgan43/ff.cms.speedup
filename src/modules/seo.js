import fs from 'fs';
import path from 'path';
import {CHARSET, projectName, SEP} from '../constant.js';
import HTMLParser from 'node-html-parser';
import {minify as HTMLMinifier} from 'html-minifier-terser';
import * as css from './css.js';
import * as clone from './clone.js';
import {Log, Stats} from './log.js';
import * as js from "./js.js";
import * as prettier from "prettier";
import * as image from "./image.js";
import {Page} from "./spider.js";
import {crawler} from "./crawler.js";

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

    const optimize = async (page, options) => {
        const onRetrieveAssets = (assets, dom) => {
            const setDomElem = (urls, callback) => {
                for (const url of Array.isArray(urls) ? urls : [urls]) {
                    assets.raw[url].forEach((asset) => {
                        const domElem = asset.domElem;

                        domElem && callback(asset.domElem, asset.attrName);
                    });

                }
            };
            const scripts = async () => {
                Log.debug(`- OPTIMIZE JS`);
                if (options.js.combine) {
                    /**
                     * Combine Javascript
                     */
                    Log.write(`- CSS: Combine`);
                    const combinedScript = js.combine(assets.scripts);
                    const scriptAsync = (
                        options.js.async
                            ? ` defer="defer" async="async"`
                            : ` defer="defer"`
                    );
                    /**
                     * Html: Remove scripts
                     */
                    Log.write(`- HTML: Remove Scripts`);
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
                    Log.write(`- JS: Save Combined ${options.js.minify ? '(Minified)' : ''}`);
                    const scriptUrl = page.dist.getWebUrl(js.save({
                        script: scriptPurged,
                        filename: page.name + page.pathName.replaceAll(SEP, "-"),
                        basePath: page.dist.rootDir,
                        min: options.js.minify,
                    }));

                    /**
                     * Html: Add combinedScript
                     */
                    Log.write(`- HTML: Add combined JS ${scriptAsync ? '(Async)' : ''}`);
                    dom.querySelector("head").appendChild(HTMLParser.parse(
                        `<script src="${scriptUrl}"${scriptAsync}></script>`
                    ));
                } else {
                    if (options.js.minify) {
                        Log.write(`- JS: Minify Scripts`);
                        js.min(assets.scripts, (script) => {
                            return page.dist.getFilePath(script.replace(page.sourceRoot, ""));
                        });
                        Log.write(`- HTML: Change Scripts to Minified`);


                        setDomElem(assets.scripts, (domElem, attrName) => {
                            const url = domElem.getAttribute(attrName);
                            if (!url.startsWith("http") && !url.endsWith(".min.js")) {
                                domElem.setAttribute(attrName, url.replace(".js", ".min.js"));
                            }
                        });
                    }

                    /**
                     * Purge Scripts
                     */
                    if (options.js.purge) {
                        //todo: da implementare
                    }

                    if (options.js.async) {
                        /**
                         * Html: set Defer JS
                         */
                        Log.write(`- HTML: change Scripts (Defer)`);
                        setDomElem(assets.scripts, (domElem) => {
                            //todo: convertire in base64 gli script inline se gia non sono async
                            domElem.setAttribute("defer", "defer");
                        });
                    }
                }
            };
            const stylesheets = async () => {
                const onLoadCSS         = "if(media!='all')media='all'";

                Log.debug(`- OPTIMIZE CSS`);
                if (options.css.combine) {
                    /**
                     * Combine StyleSheets
                     */
                    Log.write(`- CSS: Combine`);
                    const stylesheetAsync = (
                        options.css.async || options.css.critical
                            ? ` media="print" onload="${onLoadCSS}"`
                            : ''
                    );
                    const combinedStylesheet = css.combine(assets.stylesheets);

                    /**
                     * Critical CSS
                     * unCritical CSS
                     */
                    let stylesheetUncritical = (
                        options.css.critical
                            ? await css.critical({
                                srcFilePath: page.src.filePath, //TODO: da verificare forse page.url?
                                stylesheets: assets.stylesheets,
                            }).then(({css, uncritical}) => {
                                Log.write(`- CSS: Create Critical (${css.length} bytes)`);
                                Log.write(`- HTML: Add Critical css`);

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
                    Log.write(`- CSS: Create unCritical (${stylesheetUncritical.length} bytes ${combinedStylesheet.length})`);

                    /**
                     * Html: Remove stylesheets
                     */
                    Log.write(`- HTML: Remove stylesheets`);
                    setDomElem(assets.stylesheets, (domElem) => {
                        domElem.remove();
                    });

                    /**
                     * Purge unCritical
                     */
                    if(options.css.purge) {
                        stylesheetUncritical = await css.purgeStyle({
                            html: dom.toString(),
                            style: stylesheetUncritical,
                            safeClasses: options.css.purge.safeClasses,
                            blockClasses: options.css.purge.blockClasses,
                        }).then((stylesheet) => {
                            Log.write(`- CSS: Purge unCritical (${stylesheet.length} bytes)`);
                            return stylesheet;

                        }).catch((err) => {
                            console.error(err);
                            process.exit(0);
                        });
                    }

                    /**
                     * Save unCritical CSS
                     */
                    Log.write(`- CSS: Save unCritical ${options.css.minify ? '(Minified)' : ''}`);
                    const stylesheetUrl = page.dist.getWebUrl(css.save({
                        stylesheet: stylesheetUncritical,
                        filename: page.name + page.pathName.replaceAll(SEP, "-"),
                        basePath: page.dist.rootDir,
                        min: options.css.minify || options.css.critical,
                    }));

                    /**
                     * Html: Add unCritical CSS
                     */
                    Log.write(`- HTML: Add unCritical Css ${stylesheetAsync ? '(Async)' : ''}`);
                    dom.querySelector("head").appendChild(HTMLParser.parse(
                        `<link rel="stylesheet" href="${stylesheetUrl}"${stylesheetAsync}/>`
                    ));
                } else {
                    /**
                     * Critical CSS
                     */
                    if(options.css.critical) {
                        await css.critical({
                            srcFilePath: page.src.filePath, //TODO: da verificare forse page.url?
                            stylesheets: assets.stylesheets,
                        }).then(({css}) => {
                            Log.write(`- CSS: Create Critical (${css.length} bytes)`);
                            Log.write(`- HTML: Add Critical style`);

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
                        Log.write(`- CSS: Minify Stylesheets`);

                        css.min(assets.stylesheets, (stylesheet) => {
                            return page.dist.getFilePath(stylesheet.replace(page.sourceRoot, ""));
                        });

                        Log.write(`- HTML: Change Stylesheets to Minified`);
                        setDomElem(assets.stylesheets, (domElem, attrName) => {
                            const url = domElem.getAttribute(attrName);
                            if (!url.startsWith("http") && !url.endsWith(".min.css")) {
                                domElem.setAttribute(attrName, url.replace(".css", ".min.css"));
                            }
                        });
                    } else {
                        await cp(["stylesheets"]);
                    }

                    /**
                     * Html: set Async CSS
                     */
                    if(options.css.async) {
                        Log.write(`- HTML: change Stylesheets (Async)`);
                        setDomElem(assets.stylesheets, (domElem) => {
                            domElem.setAttribute("media", "print");
                            domElem.setAttribute("onLoad", onLoadCSS);
                        });
                    }
                }
            };
            const images = async () => {
                //console.log(`file://${process.cwd()}/` + urlHtml.substr(1));
                //await image.setRenderedDimensions(`file://${process.cwd()}/` + urlHtml.substr(1));
                //process.exit(0);

                options.img.excludeExt = {
                    webp: [".webp", ".svg"]
                }

                for (const img of assets.images) {
                    if (!Stats.isset(img, "images")) {
                        Stats.save(img, "images", -1);
                        await image.optimize(img, options.img).then(({imageBaseName, buffer, metadata}) => {
                            const imageFilePath = path.dirname(page.dist.getFilePath(img.replace(page.sourceRoot, ""))) + SEP + imageBaseName;
                            clone.saveData(imageFilePath, buffer, "imagesOptimized");

                            setDomElem(img, (domElem, attrName) => {
                                domElem.setAttribute('width', metadata.width);
                                domElem.setAttribute('height', metadata.height);
                                domElem.setAttribute(attrName, page.dist.getWebUrl(imageFilePath));
                            });
                        }).catch(() => {
                            Log.error(`- ASSET: Not Found (${img}) --> ${page.url}`);
                        });
                    }

                    /**
                     * Lazy Images
                     */
                    if (options.img.lazy) {
                        setDomElem(assets.images, (domElem) => {
                            domElem.tagName === "img" && domElem.setAttribute("loading", "lazy");
                        });
                    }
                }
            }
            const icons = async () => {
                for (const icon of assets.icons) {
                    if (!Stats.isset(icon, "icons")) {
                        Stats.save(icon, "icons", -1);
                        await image.optimize(icon).then(({imageBaseName, buffer}) => {
                            const imageFilePath = path.dirname(page.dist.getFilePath(icon.replace(page.sourceRoot, ""))) + SEP + imageBaseName;
                            clone.saveData(imageFilePath, buffer, "iconsOptimized");

                            setDomElem(icon, (domElem, attrName) => {
                                domElem.setAttribute(attrName, page.dist.getWebUrl(imageFilePath));
                            });
                        }).catch(() => {
                            Log.error(`- ASSET: Not Found (${icon}) --> ${page.url}`);
                        });
                    }
                }
            }

            const cp = async (assetTypes) => {
                for(const type of assetTypes) {
                    for (const asset of assets[type]) {
                        if (!Stats.isset(asset, type)) {
                            Stats.save(asset, type, -1);
                            if (fs.existsSync(asset)) {
                                const buffer = fs.readFileSync(asset, {encoding: CHARSET});
                                clone.saveData(page.dist.getFilePath(asset.replace(page.sourceRoot, "")), buffer, type + "Optimized");
                            } else {
                                Log.error(`- ASSET: Not Found (${asset}) --> ${page.url}`);
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
                Log.write(`- HTML: Save`);
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
                        ? HTMLMinifier(pageCrawled.dom.toString(), minifyOptions).then(html => {
                            return clone.saveData(page.dist.filePath, html, "htmlOptimized");
                        })
                        : clone.saveData(page.dist.filePath, prettier.format(pageCrawled.dom.toString(), { parser: 'html' }), "htmlOptimized")
                )
            }).catch(err => {
                console.error(err);
                process.exit(0);
            });
        };

        Log.debug(`SEO SPEEDUP: ${page.url}`);
        Log.track(page.url);
        Log.write(`Dom Loaded: ${page.url}`);

        const pageCrawled = crawler(page).scrape({
            attrAssetMap: options.attrAssetMap,
        });

        return onRetrieveAssets(pageCrawled.assets, pageCrawled.dom);
    }
    const publics = {
        speedUp: (options = defaultOptions) => {
            let promises = [];

            Stats.clean();
            Log.clean();

            urls.forEach((url) => {
                promises.push(optimize(new Page(url), options));
            });

            return Promise.all(promises).then(() => {
                /**
                 * Purge CSS
                 */
                if (!options.css.combine && options.css.purge) {
                    css.purgeFiles({
                        contents: Stats.get("htmlOptimized"),
                        stylesheets: Stats.get("stylesheetsOptimized"),
                        safeClasses: options.css.purge.safeClasses,
                        blockClasses: options.css.purge.blockClasses
                    }).then(() => {
                        Log.write(`- CSS: Purge stylesheets`);
                        Stats.log("speedup"); //todo: da togliere
                        Log.report(`Project: ${projectName} SpeedUp!`); //todo: da togliere
                    }).catch((err) => {
                        console.error(err);
                        process.exit(0);
                    });
                } else {
                    Stats.log("speedup");
                    Log.report(`Project: ${projectName} SpeedUp!`);
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