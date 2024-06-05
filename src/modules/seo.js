import fs from 'fs';
import path from 'path';
import {ASSET_PATH, CHARSET, DOT, project, screenResolutions, screenSizes, SEP} from '../constant.js';
import HTMLParser from 'node-html-parser';
import {minify as HTMLMinifier} from 'html-minifier-terser';
import * as css from './seo/css.js';
import * as clone from '../libs/clone.js';
import {Log, Stats, Console} from '../libs/log.js';
import * as js from "./seo/js.js";
import * as prettier from "prettier";
import * as image from "./seo/image.js";
import {Page, resolvePath} from "./page.js";
import {crawler} from "./crawler.js";
import {scriptVideoLazy} from "./seo/video.js";

const printArray = (array => {
    return `\n  ${array.join("\n  ")}`;
});
export function seo(urls) {
    const buffer = {
        assets: {},
        map: {},
        css: {},
        html: {},
        link: {
            internal: {},
            external: {}
        },
        styles: [],
        seo: {
            h1: {},
            title: {},
            description: {}
        }
    };

    const change = (files, type) => {
        const changePathByOrigin = (destination, origin) => {
            const destinationParts = path.dirname(destination).replace(project.distPath(), "").split(SEP);
            const originParts = path.dirname(origin).replace(project.srcPath(), "").split(SEP);

            // Rimuovi le parti comuni tra il percorso assoluto e il percorso di riferimento
            while (destinationParts[0] === originParts[0] && destinationParts.length > 0) {
                destinationParts.shift();
                originParts.shift();
            }

            if (destinationParts.length === 0) {
                return originParts.join(SEP);
            }

            return destinationParts
                .map(() => '..')
                .concat(originParts)
                .join(SEP);
        };

        const changeOne = (fileDst, fileSrc = null) => {
            const replacements = (buffer[type][fileSrc]
                    ? {fileSrc: buffer[type][fileSrc]}
                    : buffer[type]
            );

            let fileContent = fs.readFileSync(fileDst, CHARSET);
            for (const origin in replacements) {
                fileContent = changeData(fileContent, replacements[origin], changePathByOrigin(fileDst, origin));
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
    const changeData = (content, replacements, prefix = null) => {
        const getRelativePath = (path) => {
            return prefix + SEP + (path.startsWith(DOT + SEP)
                ? path.substring(2)
                : path
            );
        }
        for (const src in replacements) {
            content = content.replaceAll(src, prefix ? getRelativePath(replacements[src]) : replacements[src]);
        }

        return content;
    }
    const arr2regexp = (arr) => {
        return (arr || []).map(str => {
            return str.startsWith(SEP) ? new RegExp(str.slice(1)) : str;
        })
    }
    const optimize = async (page) => {
        const onRetrieveAssets = (assets, dom) => {
            const getAbsolutePath = (assetsWebUrl, sourceFile) => {
                if (assetsWebUrl.startsWith(DOT + SEP)) {
                    assetsWebUrl = assetsWebUrl.substring(2);
                }

                return (assetsWebUrl.startsWith(SEP)
                    ? assetsWebUrl
                    : resolvePath( page.src.getWebUrl(path.dirname(sourceFile)) + SEP + assetsWebUrl)
                );
            }
            const getRelativePath = (assetWebUrl, sourceFile) => {
                if(project.options.link.relativeAsset && assetWebUrl.startsWith(ASSET_PATH) && !page.src.getWebUrl(sourceFile).startsWith(ASSET_PATH)) {
                    return assetWebUrl;
                }

                if(assetWebUrl.startsWith(DOT + SEP) || assetWebUrl === SEP || assetWebUrl.startsWith(DOT + DOT + SEP)) {
                    return assetWebUrl;
                }

                const assetParts = assetWebUrl.split(SEP);
                const sourceParts = page.src.getWebUrl(path.dirname(sourceFile)).split(SEP);

                while (assetParts[0] === sourceParts[0]) {
                    assetParts.shift();
                    sourceParts.shift();
                }

                if (sourceParts.length === 0) {
                    return DOT + SEP + assetParts.join(SEP);
                }

                return sourceParts
                    .map(() => '..')
                    .concat(assetParts)
                    .join(SEP);
            };
            const setWebUrl = (url, hostname = "") => {
                let modifiedUrl = project.options.link.removeExtension.reduce((acc, ext) => acc.replace(new RegExp(`${ext}$`, 'i'), ''), url);

                if (project.options.link.removeIndex) {
                    modifiedUrl = modifiedUrl.replace(/\/index(\.[a-zA-Z0-9]{2,5})?$/i, '/');
                }
                return hostname + (!hostname && project.options.link.relativeUrl
                    ? getRelativePath(modifiedUrl, page.url)
                    : getAbsolutePath(modifiedUrl, page.url)
                );
            }
            const setDomElem = (urls, onDomElem) => {
                for (const url of Array.isArray(urls) ? urls : [urls]) {
                    assets.dom[url] && assets.dom[url].forEach((asset) => {
                        onDomElem(asset.domElem, asset.attrName);
                    });
                }
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
                    buffer[type][data.sourceFile][data.src] = getRelativePath(assetWebUrl, data.sourceFile);
                });
            }
            const getOuterSize = (imageData, resolution) => {
                const { width = null, height = null } = imageData || {};
                return {
                    width: width > 0
                        ? width > resolution.width ? resolution.width : width
                        : null,
                    height: height > 0
                        ? height > resolution.height ? resolution.height : height
                        : null
                };
            }
            const calcOuterSize = (domElem, bufferImage) => {
                if(bufferImage.default.outerWidth && bufferImage.default.outerHeight) {
                    domElem.setAttribute('width', bufferImage.default.outerWidth);
                    domElem.setAttribute('height', bufferImage.default.outerHeight);
                } else {
                    bufferImage.metadata && bufferImage.metadata().then((metadata) => {
                        if (metadata) {
                            const imgWidth = parseInt(domElem.getAttribute('width'));
                            const imgHeight = parseInt(domElem.getAttribute('height'));
                            if (imgHeight && !imgWidth) {
                                domElem.setAttribute('width', Math.round(metadata.width * imgHeight / metadata.height));
                            } else if (imgWidth && !imgHeight) {
                                domElem.setAttribute('height', Math.round(metadata.height * imgWidth / metadata.width));
                            } else if(imgWidth && imgHeight) {
                                const ratio = metadata.width / metadata.height;
                                if (imgWidth / imgHeight > ratio) {
                                    domElem.setAttribute('height', Math.round(imgWidth / ratio));
                                } else {
                                    domElem.setAttribute('width', Math.round(imgHeight * ratio));
                                }
                            } else {
                                domElem.setAttribute('width', metadata.width);
                                domElem.setAttribute('height', metadata.height);
                            }
                        }
                    });
                }
            }

            const technical = async() => {
                const h1s = dom.querySelectorAll("h1");
                if (h1s.length === 0) {
                    Log.error(`- SEO H1: Empty`, page.dist.filePath);
                } else {
                    if (h1s.length > 1) {
                        Log.error(`- SEO H1: Multiple Tag`, page.dist.filePath);
                    }

                    const h1 = h1s[0].textContent;
                    if (h1.length > project.options.seo.h1.max) {
                        Log.warn(`- SEO H1 too long: (${h1.length}/${project.options.seo.h1.max} max) ${h1}`, page.dist.filePath);
                    } else if (h1.length < project.options.seo.h1.min) {
                        Log.warn(`- SEO H1 too short: (${h1.length}/${project.options.seo.h1.min} min) ${h1}`, page.dist.filePath);
                    }

                    (buffer.seo.h1[h1] ??= []).push(page.dist.filePath);
                }

                const titles = dom.querySelectorAll("title");
                if (titles.length === 0) {
                    Log.error(`- SEO Title: Empty`, page.dist.filePath);
                } else {
                    if (titles.length > 1) {
                        Log.error(`- SEO Title: Multiple Tag`, page.dist.filePath);
                    }

                    const title = titles[0].textContent;
                    if (title.length > project.options.seo.title.max) {
                        Log.warn(`- SEO Title too long: (${title.length}/${project.options.seo.title.max} max) ${title}`, page.dist.filePath);
                    } else if (title.length < project.options.seo.title.min) {
                        Log.warn(`- SEO Title too short: (${title.length}/${project.options.seo.title.min} min) ${title}`, page.dist.filePath);
                    }

                    (buffer.seo.title[title] ??= []).push(page.dist.filePath);
                }

                const descriptions = dom.querySelectorAll("meta[name='description']");
                if (descriptions.length === 0) {
                    Log.error(`- SEO Meta Description: Empty`, page.dist.filePath);
                } else {
                    if (descriptions.length > 1) {
                        Log.error(`- SEO Meta Description: Multiple Tag`, page.dist.filePath);
                    }

                    const description = descriptions[0].getAttribute("content");
                    if (description.length > project.options.seo.description.max) {
                        Log.warn(`- SEO Meta Description too long: (${description.length}/${project.options.seo.description.max} max) ${description}`, page.dist.filePath);
                    } else if (description.length < project.options.seo.description.min) {
                        Log.warn(`- SEO Meta Description too short: (${description.length}/${project.options.seo.description.min} min) ${description}`, page.dist.filePath);
                    }

                    (buffer.seo.description[description] ??= []).push(page.dist.filePath);
                }
                //todo: da implementare il controllo sul canonical
                //todo: da implementare il controllo sul robots
                //todo: da implementare il controllo sul hreflang
                //todo: da implementare il controllo sul sitemap
                //todo: da implementare il controllo sul openGraph
                //todo: da implementare il controllo sul twitter
                //todo: da implementare il controllo sulla favicon



            }
            const accessibility = async() => {

            }
            const videos = async () => {
                Log.debug(`- OPTIMIZE VIDEOS`);
                if(assets.videos.length > 0) {
                    Log.write(`- VIDEO Lazy: ${printArray(assets.videos)}`, page.dist.filePath);
                    assets.system.scripts.push(scriptVideoLazy());
                    setDomElem(assets.videos, (domElem) => {
                        domElem.setAttribute("data-src", domElem.getAttribute("src"));
                        domElem.removeAttribute("src");
                    });
                }
            }
            const scripts = async () => {
                Log.debug(`- OPTIMIZE JS`);
                const scriptAsync = (
                    project.options.js.async
                        ? `defer="defer" async="async"`
                        : `defer="defer"`
                );

                if (project.options.js.combine) {
                    /**
                     * Combine Javascript
                     * - assets.scripts (files)
                     * - assets.embed.scripts
                     * - assets.system.scripts
                     */
                    Log.write(`- JS Combine: ${printArray(assets.scripts)}`, page.dist.filePath);
                    const combinedScript = (await js.combine(assets.scripts)) +
                        assets.embed.scripts
                        .reduce((result, elem) => {
                            const content = elem.textContent || elem.innerText;
                            elem.remove();
                            result.push(content);

                            return result;
                        }, [])
                        .join('\n')
                        + assets.system.scripts.join('\n');

                    Log.write(`- JS Combine Size: (${combinedScript.length} bytes)`, page.dist.filePath);

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
                        project.options.js.purge
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
                        min: project.options.js.minify,
                    });
                    Log.write(`- JS Combine Save${project.options.js.minify ? ' (Minified)' : ''}:  ${scriptFilePath}`, page.dist.filePath);

                    /**
                     * Html: Add Combined Script
                     */
                    const scriptUrl = page.dist.getWebUrl(scriptFilePath);
                    Log.write(`- HTML Add JS Combine${scriptAsync ? ' (Async)' : ''}: ${scriptUrl}`, page.dist.filePath);
                    dom.querySelector("head").appendChild(HTMLParser.parse(
                        `<script src="${setWebUrl(scriptUrl)}" ${scriptAsync}></script>`
                    ));
                } else {
                    if (project.options.js.minify) {
                        js.min(assets.scripts, (script) => {
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
                     * Add System Scripts
                     */
                    if (assets.system.scripts.length > 0) {
                        //todo: da aggiungere la minifizzazione
                        Log.write(`- JS Add System Scripts`, page.dist.filePath);

                        dom.querySelector("body").appendChild(HTMLParser.parse(
                            `<script ${scriptAsync}>${assets.system.scripts.join('\n')}</script>`
                        ));
                    }

                    /**
                     * Purge Scripts
                     */
                    if (project.options.js.purge) {
                        //todo: da implementare
                    }

                    /**
                     * Html: change Scripts reg
                     */
                    Log.write(`- JS Change Scripts${project.options.js.async ? " Defer": ""}${project.options.js.minify ? ", Minified": ""}: ${printArray(assets.scripts)}`, page.dist.filePath);
                    setDomElem(assets.scripts, (domElem, attrName) => {
                        let url = domElem.getAttribute(attrName);

                        /**
                         * Html: set min Extension Scripts
                         */
                        if (project.options.js.minify && !url.endsWith(".min.js")) {
                            url = url.replace(".js", ".min.js");
                        }
                        if (!url.startsWith("http")) {
                            domElem.setAttribute(attrName, setWebUrl(url));
                        }

                        /**
                         * Html: set Defer Scripts
                         */
                        domElem.setAttribute("defer", "defer");
                        if(project.options.js.async) {
                            domElem.setAttribute("async", "async");
                        }
                    });

                    /**
                     * Embed Scripts
                     */
                    if(assets.embed.scripts.length > 0) {
                        Log.write(`- JS Add Embed Scripts`, page.dist.filePath);
                        assets.embed.scripts.forEach((domElem) => {
                            domElem.setAttribute("defer", "defer");
                            if(project.options.js.async) {
                                const content = domElem.textContent || domElem.innerText;
                                const base64Content = Buffer.from(content).toString('base64');

                                domElem.setAttribute("async", "async");
                                domElem.setAttribute("src", `data:text/javascript;base64,${base64Content}`);
                                domElem.textContent = "";
                            }
                        });
                    }
                }
            };
            const stylesheets = async () => {
                const onLoadCSS         = "if(media!=='all')media='all'";

                Log.debug(`- OPTIMIZE CSS`);
                if (project.options.css.combine) {
                    /**
                     * Combine StyleSheets
                     */
                    Log.write(`- CSS Combine: ${printArray(assets.stylesheets)}`, page.dist.filePath);
                    const stylesheetAsync = (
                        project.options.css.async || project.options.css.critical
                            ? ` media="print" onload="${onLoadCSS}"`
                            : ''
                    );

                    /**
                     * Critical CSS
                     * unCritical CSS
                     * or
                     * Combine StyleSheets
                     * plus
                     * Combine StyleSheets:
                     * - assets.embed.styles
                     * - assets.system.styles
                     */
                    let stylesheetUncritical = (
                        project.options.css.critical
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
                        : await css.combine(assets.stylesheets)
                    )
                    //todo: da gestire il cambio degli url degli asset che erano presenti nell'html
                    /*+ assets.embed.styles
                        .reduce((result, elem, index) => {
                            result.push((() => {
                                if (elem.tagName === "STYLE") {
                                    const content = elem.textContent || elem.innerText;
                                    elem.remove();
                                    return content;
                                } else {
                                    const style = elem.getAttribute("style");
                                    const index = (buffer.styles.indexOf(style) === -1
                                            ? buffer.styles.push(style) - 1
                                            : buffer.styles.indexOf(style)
                                    );

                                    elem.classList.add(`style-${index}`);
                                    elem.removeAttribute("style");

                                    return `.style-${index} { ${style} }`;
                                }
                            })());

                            return result;
                        }, [])
                        .join('\n')*/
                    + assets.system.styles.join('\n');

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
                    if (project.options.css.purge) {
                        stylesheetUncritical = await css.purgeStyle({
                            html: dom.toString(),
                            style: stylesheetUncritical,
                            safeClasses: arr2regexp(project.options.css.purge.safeClasses),
                            blockClasses: arr2regexp(project.options.css.purge.blockClasses),
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
                        min: project.options.css.minify || project.options.css.critical,
                    });
                    Log.write(`- CSS Combine Save${project.options.css.minify ? ' (Minified)' : ''}: ${stylesheetFilePath}`, page.dist.filePath);

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
                    if (project.options.css.critical) {
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
                    if (project.options.css.minify) {
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
                     * Embed Styles
                     */
                    if(assets.embed.styles.length > 0) {
                        Log.write(`- CSS Add Embed Styles`, page.dist.filePath);
                        assets.embed.styles.forEach((domElem) => {
                            //todo: da aggiungere la minifizzazione
                        });
                    }

                    /**
                     * Add System Styles
                     */
                    if (assets.system.styles.length > 0) {
                        //todo: da aggiungere la minifizzazione
                        Log.write(`- CSS Add System Styles`, page.dist.filePath);

                        dom.querySelector("head").appendChild(HTMLParser.parse(
                            `<style>${assets.system.styles.join('\n')}</style>`
                        ));
                    }

                    /**
                     * Html: change StyleSheets Ref
                     */
                    Log.write(`- CSS Change Stylesheets${project.options.css.async ? " Async": ""}${project.options.css.minify ? ", Minified": ""}: ${printArray(assets.stylesheets)}`, page.dist.filePath);
                    setDomElem(assets.stylesheets, (domElem, attrName) => {
                        let url = domElem.getAttribute(attrName);

                        /**
                         * Html: set min Extension StyleSheets
                         */
                        if (project.options.css.minify && !url.endsWith(".min.css")) {
                            url = url.replace(".css", ".min.css");
                        }
                        if (!url.startsWith("http")) {
                            domElem.setAttribute(attrName, setWebUrl(url));
                        }

                        /**
                         * Html: set Async StyleSheets
                         */
                        if(project.options.css.async) {
                            domElem.setAttribute("media", "print");
                            domElem.setAttribute("onLoad", onLoadCSS);
                        }
                    });
                }
            };
            const images = async () => {
                for (const img of assets.images) {
                    const assetImg = (img.startsWith(project.options.host)
                        ? project.srcPath(img.replace(project.options.host, ""))
                        : img
                    );

                    if (fs.existsSync(assetImg)) {
                        const imgOptimized = image.optimize(assetImg, project.options.img);
                        const imageDirPath = path.dirname(page.dist.getFilePath(assetImg));

                        /**
                         * Init buffer img
                         */
                        buffer.assets[assetImg] = {
                            responsive : [],
                            metadata: imgOptimized.metadata,
                            default: {
                                dst: null,
                                outerWidth: null,
                                outerHeight: null
                            }
                        };

                        /**
                         * Responsive Image
                         */
                        const absoluteAssetImg = path.resolve(assetImg).replaceAll("\\", "/");
                        if (imgOptimized.isResponsive && page.images[absoluteAssetImg]) {
                            let prevWidth = '';
                            for (let index = 0; index < screenResolutions.length; index++) {
                                const resolution = screenResolutions[index];
                                const outerSize = getOuterSize(page.images[absoluteAssetImg]?.[index], resolution);
                                const responsiveFilePath = imageDirPath + SEP + imgOptimized.imageBaseName(outerSize.width);

                                if (!outerSize.width || prevWidth === outerSize.width) {
                                    continue;
                                }

                                buffer.assets[assetImg].responsive.push({
                                    dst: page.dist.getWebUrl(responsiveFilePath),
                                    resolution: resolution,
                                    size: screenSizes[index],
                                    outerWidth: outerSize.width,
                                    outerHeight: outerSize.height
                                });

                                prevWidth = outerSize.width;

                                /**
                                 * Save Image responsive
                                 */
                                if (!Stats.isset(responsiveFilePath, "imagesOptimized")) {
                                    clone.saveData(responsiveFilePath, await imgOptimized.buffer(outerSize.width, outerSize.height), "imagesOptimized");
                                }
                            }

                            /**
                             * Set Image default
                             */
                            if (buffer.assets[assetImg].responsive.length > 0) {
                                const countResolution = buffer.assets[assetImg].responsive.length - 1;
                                const { dst, outerWidth, outerHeight } = buffer.assets[assetImg].responsive[countResolution];
console.log(img, assetImg, dst, outerWidth, outerHeight);
                                buffer.assets[assetImg].default = { dst, outerWidth, outerHeight };
                            }
                        }

                        if (!buffer.assets[assetImg].default.dst) {
                            /**
                             * Set Image default
                             */
                            const imageFilePath = imageDirPath + SEP + imgOptimized.imageBaseName();
                            buffer.assets[assetImg].default.dst = page.dist.getWebUrl(imageFilePath);

                            /**
                             * Save Image default
                             */
                            if (!Stats.isset(imageFilePath, "imagesOptimized")) {
                                clone.saveData(imageFilePath, await imgOptimized.buffer(), "imagesOptimized");
                            }
                        }

                        /**
                         * Write buffer foreach sourceFile (stylesheet, html)
                         */
                        setSource(assetImg, buffer.assets[assetImg].default.dst);
                    } else {
                        Log.error(`- ASSET: Not Found (${img}) --> ${page.url}`, page.dist.filePath);
                    }

                    if (!buffer.assets[img] && buffer.assets[assetImg]) {
                        buffer.assets[img] = buffer.assets[assetImg];
                    }

                    /**
                     * Set foreach Image and foreach Page setDomElem
                     */
                    setDomElem(img, (domElem, attrName) => {
                        const hostname = (domElem.tagName === "META"
                            ? project.options.host
                            : ""
                        );

                        if (buffer.assets[img]) {
                            Log.write(`- HTML Change Image${project.options.img.lazy ? " Lazy": ""}: ${buffer.assets[img].default.dst}`, page.dist.filePath);
if(!buffer.assets[img].default.dst) {
    console.log(page.url, img, buffer.assets[img], assets.images);
}
                            domElem.setAttribute(attrName, setWebUrl(buffer.assets[img].default.dst, hostname));
                            if (domElem.tagName === "IMG") {
                                /**
                                 * Set Srcset and Sizes foreach Image responsive
                                 */
                                if(buffer.assets[img].responsive.length > 1) {
                                    const srcset = [];
                                    const sizes = [];
                                    buffer.assets[img].responsive.forEach((responsive) => {
                                        srcset.push(`${setWebUrl(responsive.dst, hostname)} ${responsive.resolution.size}w`);
                                        responsive.size && sizes.push(responsive.size);
                                    });
                                    sizes.push("100vw");
                                    domElem.setAttribute("srcset", srcset.join(", "));
                                    domElem.setAttribute("sizes", sizes.join(", "));
                                }
                            } else if(attrName === "poster") {
                                domElem.setAttribute(attrName, setWebUrl(buffer.assets[img].default.dst, hostname));
                            }

                            /**
                             * Set Image Width, Height
                             */
                            if (domElem.tagName === "IMG") {
                                if(buffer.assets[img].responsive.length > 1) {
                                    domElem.removeAttribute('width');
                                    domElem.removeAttribute('height');
                                } else {
                                    calcOuterSize(domElem, buffer.assets[img]);
                                }
                            }

                            /**
                             * Lazy Image
                             */
                            if (project.options.img.lazy && domElem.tagName === "IMG") {
                                domElem.setAttribute("loading", "lazy");
                            }

                            /**
                             * Alt Image
                             */
                            if (domElem.tagName === "IMG" && !domElem.getAttribute('alt')) {
                                if(project.options.img.alt) {
                                    const basenameImage = domElem.getAttribute("title") || path.basename(img, path.extname(img)).replaceAll("-", " ");

                                    Log.warn(`- IMAGE noAlt: ${img} --> ${basenameImage} (Fixed)`, page.dist.filePath);
                                    domElem.setAttribute("alt", basenameImage);
                                } else {
                                    Log.error(`- IMAGE noAlt: ${img}`, page.dist.filePath);
                                }
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
                            const iconOptimized = image.optimize(icon, project.options.img);
                            const iconFilePath = path.dirname(page.dist.getFilePath(icon)) + SEP + iconOptimized.imageBaseName();
                            const iconWebUrl = page.dist.getWebUrl(iconFilePath);
                            /**
                             * Write buffer img: new dst, metadata
                             */
                            buffer.assets[icon] = {
                                default: {
                                    dst: iconWebUrl,
                                    outerWidth: null,
                                    outerHeight: null
                                },
                                metadata: iconOptimized.metadata,
                            };

                            /**
                             * Write buffer foreach sourceFile (stylesheet, html)
                             */
                            setSource(icon, iconWebUrl);

                            clone.saveData(iconFilePath, await iconOptimized.buffer(), "iconsOptimized");
                        } else {
                            Log.error(`- ASSET: Not Found (${icon}) --> ${page.url}`, page.dist.filePath);
                        }
                    }

                    /**
                     * Set foreach Image and foreach Page setDomElem
                     */
                    setDomElem(icon, (domElem, attrName) => {
                        if (buffer.assets[icon]) {
                            domElem.setAttribute(attrName, setWebUrl(buffer.assets[icon].default.dst));

                            if (buffer.assets[icon].metadata && domElem.tagName === "IMG") {
                                calcOuterSize(domElem, buffer.assets[icon]);
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
                technical(),
                accessibility(),
                videos(),
                scripts(),
                stylesheets(),
                images(),
                icons(),
                cp(["fonts", "audios", "videos", "others"])
            ]).then(() => {
                Log.write(`- HTML Save: ${page.url} --> ${page.dist.filePath}`, page.dist.filePath);

                setDomElem(assets.html, (domElem, attrName) => {
                    const href = domElem.getAttribute(attrName);

                    domElem.setAttribute(attrName, setWebUrl(href))
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

                return (project.options.html.minify
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

        const pageCrawled = (await crawler(page, true)).scrape({
            attrAssetMap: project.options.attrAssetMap,
        });

        return onRetrieveAssets(pageCrawled.assets, pageCrawled.dom);
    }
    const publics = {
        speedUp: () => {
            let promises = [];

            clone.deleteProject("dist");
            Stats.clean();
            Log.clean(true);

            urls.forEach((url) => {
                promises.push(optimize(new Page(url)));
            });

            return Promise.all(promises).then(() => {
                /**
                 * SEO Technical
                 */
                Object.keys(buffer.seo.h1).forEach((h1) => {
                    if (buffer.seo.h1[h1].length > 1) {
                        Log.error(`- SEO Duplication H1: ${h1} in` + printArray(buffer.seo.h1[h1]), "SEO WEBSITE");
                    }
                });
                Object.keys(buffer.seo.title).forEach((title) => {
                    if (buffer.seo.title[title].length > 1) {
                        Log.error(`- SEO Duplication Title: ${title}` + printArray(buffer.seo.title[title]), "SEO WEBSITE");
                    }
                });
                Object.keys(buffer.seo.description).forEach((description) => {
                    if (buffer.seo.description[description].length > 1) {
                        Log.error(`- SEO Duplication Meta Description: ${description}` + printArray(buffer.seo.description[description]), "SEO WEBSITE");
                    }
                });

                /**
                 * Stylesheet
                 */
                const stylesheets = Stats.get("stylesheetsOptimized") || [];

                change(stylesheets, "css");

                /**
                 * Purge CSS
                 */
                if (!project.options.css.combine && project.options.css.purge) {
                    css.purgeFiles({
                        contents: Stats.get("htmlOptimized"),
                        stylesheets: stylesheets,
                        safeClasses: arr2regexp(project.options.css.purge.safeClasses),
                        blockClasses: arr2regexp(project.options.css.purge.blockClasses)
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

                return Stats.geAll("tag");
            }).catch(err => {
                console.error(err);
                process.exit(0);
            });
        }
    };

    return publics;
}