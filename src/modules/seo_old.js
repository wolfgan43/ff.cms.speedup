import fs from 'fs';
import path from 'path';
import {HTML_EXT, project, SEP} from '../constant.js';
import HTMLParser from 'node-html-parser';
import {minify as HTMLMinifier} from 'html-minifier-terser';
import * as css from './css.js';
import * as clone from './clone.js';
import {Log, Stats} from './log.js';
import * as js from "./js.js";
import * as prettier from "prettier";
import * as image from "./image.js";
import {Page} from "./spider.js";

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

    const optimize = (page, options) => {
        const dom = page.getDom();
        const opImg = async () => {
            //console.log(`file://${process.cwd()}/` + urlHtml.substr(1));
            //await image.setRenderedDimensions(`file://${process.cwd()}/` + urlHtml.substr(1));
            //process.exit(0);

            //todo: da bloccare il render per le immagini gia ottimizzate.
            const images = [
                ...dom.querySelectorAll('img'),
                ...dom.querySelectorAll('link[type^="image/"]'),
                ...dom.querySelectorAll('meta[property$=":image"]'),
                ...dom.querySelectorAll('meta[name$=":image"]'),
            ];
            options.img.excludeExt = {
                webp: [".webp", ".svg"]
            }
            //todo: da aggiungere tutti i riferimenti dentro al css

            for (const imgElement of images) {
                let src = imgElement.getAttribute('src') || imgElement.getAttribute('href') || imgElement.getAttribute('content');
                if (!src) {
                    Log.error(`- IMG: missing "src" (${page.src.filePath}) --> ${imgElement.toString()}`);
                    continue;
                }
                if (!fs.existsSync(page.src.getFilePath(src))) {
                    //todo: da tolgiere. il crawler deve rendere l'src empty. entra qui perche non è gestito il meta og e twitter
                    continue;
                }

                await image.optimize(page.src.getFilePath(src), options.img).then(({imageBaseName, buffer, metadata}) => {
                    const imageFilePath = path.dirname(page.dist.getFilePath(src)) + SEP + imageBaseName;
                    clone.saveData(imageFilePath, buffer, "optimized");

                    imgElement.setAttribute('width', metadata.width);
                    imgElement.setAttribute('height', metadata.height);
                    imgElement.setAttribute('src', page.dist.getWebUrl(imageFilePath));
                });

                if (options.img.lazy) {
                    /**
                     * Lazy Images
                     */
                    imgElement.setAttribute("loading", "lazy");
                }
            }
        }
        const opJs = async () => {
            let scripts         = [];

            Log.debug(`- OPTIMIZE JS`)
            dom.querySelectorAll("script[src]").forEach((element) => {
                const fileJs = page.src.getFilePath(element.getAttribute("src"));
                scripts.push(fileJs);

                Stats.save(fileJs, "js", fs.statSync(fileJs).size);
            });

            if (options.js.combine) {
                /**
                 * Combine Javascript
                 */
                Log.write(`- CSS: Combine`);
                const combinedScript = js.combine(scripts);
                const scriptAsync = (
                    options.js.async
                        ? ` defer="defer" async="async"`
                        : ` defer="defer"`
                );
                /**
                 * Html: Remove scripts
                 */
                Log.write(`- HTML: Remove Scripts`);
                dom.querySelectorAll('script[src]').forEach((element) => {
                    element.remove();
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
                    await js.min(scripts, (script) => {
                        return script.replace(page.src.rootDir, page.dist.rootDir);
                    });
                    Log.write(`- HTML: Change Scripts to Minified`);
                    dom.querySelectorAll('script[src]').forEach((element) => {
                        const src = element.getAttribute("src");
                        if (!src.startsWith("http") && !src.endsWith(".min.js")) {
                            element.setAttribute("src", src.replace(".js", ".min.js"));
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
                    dom.querySelectorAll("script").forEach((element) => {
                        //convertire in base64 gli script inline se gia non sono async
                        switch (element.getAttribute("type")) {
                            case "application/javascript":
                            case "text/javascript":
                            case undefined:
                                element.setAttribute("defer", "defer");
                                break;
                            case "application/ld+json":
                            default:
                        }
                    });
                }
            }
        }
        const opCss = async () => {
            const onLoadCSS         = "if(media!='all')media='all'";
            let stylesheets         = [];

            Log.debug(`- OPTIMIZE CSS`)
            dom.querySelectorAll('link[rel="stylesheet"]').forEach((element) => {
                const fileCss = page.src.getFilePath(element.getAttribute("href"));
                stylesheets.push(fileCss);
                Stats.save(fileCss, "css", fs.statSync(fileCss).size);
            });

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
                const combinedStylesheet = css.combine(stylesheets);

                /**
                 * Critical CSS
                 * unCritical CSS
                 */
                let stylesheetUncritical = (
                    options.css.critical
                        ? await css.critical({
                            srcFilePath: page.src.filePath,
                            stylesheets: stylesheets,
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
                dom.querySelectorAll('link[rel="stylesheet"]').forEach((element) => {
                    element.remove();
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
                        srcFilePath: page.src.filePath,
                        stylesheets: stylesheets,
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

                    await css.min(stylesheets, (stylesheet) => {
                        return stylesheet.replace(page.src.rootDir, page.dist.rootDir);
                    });

                    Log.write(`- HTML: Change Stylesheets to Minified`);
                    dom.querySelectorAll('link[rel="stylesheet"]').forEach((element) => {
                        const href = element.getAttribute("href");
                        if (!href.startsWith("http") && !href.endsWith(".min.css")) {
                            element.setAttribute("href", href.replace(".css", ".min.css"));
                        }
                    });
                }

                /**
                 * Html: set Async CSS
                 */
                if(options.css.async) {
                    Log.write(`- HTML: change Stylesheets (Async)`);
                    dom.querySelectorAll('link[rel="stylesheet"]').forEach((element) => {
                        element.setAttribute("media", "print");
                        element.setAttribute("onLoad", onLoadCSS);
                    });
                }
            }
        }

        Log.debug(`SEO SPEEDUP: ${page.url}`);
        Log.track(page.url);
        Log.write(`Dom Loaded: ${page.url}`);
        return Promise.all([
            opJs(),
            opCss(), //todo: richiamare opimg per ogni css processed
            opImg(),
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
                ? HTMLMinifier(dom.toString(), minifyOptions).then(html => {
                    return clone.saveData(page.dist.filePath, html, "optimized");
                })
                : clone.saveData(page.dist.filePath, prettier.format(dom.toString(), { parser: 'html' }), "optimized")
            )
        })
        .catch(err => {
            console.error(err);
            process.exit(0);
        });
    };

    const publics = {
        speedUp: (options = defaultOptions) => {
            let promises = [];
            urls.forEach((urlHtml) => {
                if (path.extname(urlHtml).toLowerCase().substring(1) !== HTML_EXT) {
                    throw new Error("html.output: htmlSource must be a html file");
                }

                promises.push(optimize(new Page(urlHtml), options));
            });

            return Promise.all(promises).then(() => {
                /**
                 * Purge CSS
                 */
                if (!options.css.combine && options.css.purge) {
                    css.purgeFiles({
                        rootDir: project.srcPath(),
                        contents: urls,
                        stylesheets: Stats.get(options.css.minify ? "cssMinify" : "css"),
                        safeClasses: options.css.purge.safeClasses,
                        blockClasses: options.css.purge.blockClasses,
                        onSaveData: (cssFilePath => {
                            return cssFilePath.replace(project.srcPath(), project.distPath())
                        })
                    }).then(() => {
                        Log.write(`- CSS: Purge stylesheets`);
                    }).catch((err) => {
                        console.error(err);
                        process.exit(0);
                    });
                }
                //Log.report(`Project: ${projectName} SpeedUp!`);
                return publics;
            }).catch(err => {
                console.error(err);
                process.exit(0);
            });
        }
    };

    return publics;
}