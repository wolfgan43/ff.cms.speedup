import path from "path";
import {Log} from "./log.js";
import {CHARSET, DOT, SEP} from "../constant.js";
import fetch from "node-fetch";
import fs from "fs";

const _assetsURLs       = {};
const _filenameByCat    = {};

export function crawler(page) {
    const dom = page.getDom();
    const getAssetsByType = (attrAssetMap = []) => {

        const assetURLs = {
            html        : [],
            link        : [],
            images      : [],
            icons       : [],
            stylesheets : [],
            scripts     : [],
            fonts       : [],
            audios      : [],
            videos      : [],
            others      : [],
            dom         : {},
            source      : {},
        };
        const addAssetURLByDomElem = (url, {domElem, attrName, sourceFile = null}) => {
            if (url) {
                if (domElem) {
                    if (!assetURLs.dom[url]) {
                        assetURLs.dom[url] = [];
                    }
                    assetURLs.dom[url].push({
                        domElem: domElem,
                        attrName: attrName
                    });
                }
                if (sourceFile) {
                    if (!assetURLs.source[url]) {
                        assetURLs.source[url] = [];
                    }
                    assetURLs.source[url].push({
                        sourceFile: sourceFile,
                        src: attrName
                    });
                }
            } else {
               // Log.error(`- ASSET: Empty (${sourceFile || page.url}) --> ${domElem && domElem.toString()}`);
            }
        };
        const storeAssetUrl = (url, key) => {
            const pushAssetUrl = (url, key) => {
                const assetUrl = url.startsWith(page.sourceRoot) ? url : resolveSrcPath(url);
                assetURLs[key].includes(assetUrl) || assetURLs[key].push(assetUrl);

                return assetUrl;
            }
            const resolvePageHtml = (link) => {
                const cleanUrl = link.replace(/\?.*$/, "").replace(/#.*$/, "");
                const linkExt = path.extname(cleanUrl);
                const extUrl = (linkExt === "" ? page.extension : "");
                const url = (
                    link.indexOf(SEP) === 0
                        ? page.sourceRoot
                        : page.sourceRoot + page.pathName + SEP
                ) + (cleanUrl === SEP ? "" : cleanUrl);

                if(!["", ".html", ".htm"].includes(linkExt)) {
                    Log.debug("STORE ASSET SKIP " + page.url + " => " + link);
                } else if(page.isWeb
                    && link.match(new RegExp("^(http|https|file):\/\/" + page.sourceRoot))
                    && cleanUrl.length > 0
                ) {
                    return url;
                } else if(page.isWeb
                    && link.indexOf(":") === -1
                    && cleanUrl.length > 0
                ) {
                    return url;
                } else if(!page.isWeb
                    && fs.existsSync(url + extUrl)
                    && cleanUrl.length > 0
                ) {
                    return url + extUrl;
                } else if(!page.isWeb
                    && linkExt === "" && fs.existsSync(url + SEP + "index" + extUrl)
                    && cleanUrl.length > 0
                ) {
                    return url + SEP + "index" + extUrl;
                } else {
                    Log.debug("NO ASSET " + page.url + " => " + link);
                }
            }

            const ext       = path.extname(url);

            const support   = {
                images          : [".jpg", ".jpeg", ".gif", ".png", ".webp", ".svg"],
                fonts           : [".ttf", ".otf", ".woff", ".woff2", ".eot", ".svg"],
                icons           : [".ico", ".svg"],
                stylesheets     : [".css"],
                scripts         : [".js"],
                videos          : [".mp4", ".ogv", ".mpg", ".mpeg", ".avi", ".webm"],
                audios          : [".mp3", ".ogg", ".wav", ".aac", ".webm"],
                others          : [
                                    ".pdf", ".txt", ".doc", ".docx",
                                    ".xls", ".xlsx",
                                    ".ppt", ".pptx",
                                    ".zip", ".tar", ".rar",
                                    ".xml", ".json", ".csv",
                                ],
            }
            let pageHtmlUrl;
            if (!url) {
                Log.debug("ASSET EMPTY: " + page.url);
            } else if (ext && support[key] && support[key].includes(ext)) {
                return pushAssetUrl(url, key);
            } else if ((pageHtmlUrl = resolvePageHtml(url))) {
                Log.debug("FIND HTML: " + page.url + " => " + url + " => " + pageHtmlUrl);
                assetURLs.html.includes(pageHtmlUrl) || assetURLs.html.push(pageHtmlUrl);
                return pageHtmlUrl;
            } else if(["", ".html", ".htm"].includes(path.extname(url))) {
                assetURLs.link.includes(url) || assetURLs.link.push(url);
            //} else if (isPageHtml(url, true)) {
            //    Log.debug("FIND HTML: " + page.url + " => " + url);
            } else if (!support[key]) {
                for (let [supportKey, supportExt] of Object.entries(support)) {
                    if (supportExt.includes(ext)) {
                        return pushAssetUrl(url, supportKey);
                    }
                }

                Log.debug("NO ASSET SUPPORT: " + page.url + " => " + url);
            } else {
                Log.warn("NO ASSET: " + page.url + " => " + url);
            }
        };

        const resolveSrcPath = (asset) => {
            const isAbsolutePath = asset.startsWith(SEP) || asset.startsWith(DOT + SEP);

            if (asset.startsWith('http')) {
                return asset;
            } else if (isAbsolutePath) {
                return page.sourceRoot + asset;
            } else {
                return page.sourceRoot + page.pathName + SEP + asset;
            }
        };

        const retrieveURLs = async (asset, data = null) => {
            const assetSrcPath      = resolveSrcPath(asset);

            if (_assetsURLs[assetSrcPath] === undefined) {
                Log.debug(`EXTRACT URL FROM: ${assetSrcPath}`);

                _assetsURLs[assetSrcPath] = [];
                if (!data) {
                    data = (page.isWeb || asset.startsWith('http')
                            ? await fetch(assetSrcPath).then(res => res.text())
                            : fs.readFileSync(assetSrcPath, {encoding: CHARSET})
                    );
                }

                //const regexUrl = /(?<!@import\s*)url\s*\(\s*['"]?\s*((?!data:)([^'"?#)]+)+)\s*['"]?\s*\)\s*/gi;
                const regexUrl = /(?<!@import\s)url\s*\((['"]?)\s*((?!data:)([^'"?#)]+))[?#]?[^'")]*\1\)/gi;
                const regexImport = /@import\s(?:url\()?\s?["'](.*?)["']\s?\)?[^;]*;?/gi;
                /**
                 * url([...])
                 */
                const dictExt   = {
                    ".ttf"          : "fonts",
                    ".otf"          : "fonts",
                    ".woff"         : "fonts",
                    ".woff2"        : "fonts",
                    ".eot"          : "fonts",
                }

                let extname;
                let filename;
                for (const match of data.matchAll(regexUrl)) {
                    _assetsURLs[assetSrcPath].push(match[2]);
                    extname = path.extname(match[2]);
                    filename = path.basename(match[2], extname);
                    dictExt[extname] && (_filenameByCat[filename] = dictExt[extname]);
                }
                /**
                 * @import
                 */
                for (const match of data.matchAll(regexImport)) {
                    //todo: scendere nel path estraendo i url e file degli assets
                    //console.log(path.dirname(srcFilePath) + SEP + match[1]);
                }
            }

            for (const url of [...new Set(_assetsURLs[assetSrcPath])]) {
                addAssetURLByDomElem(storeAssetUrl(path.dirname(assetSrcPath) + (url.startsWith(SEP) ? "": SEP) + url, _filenameByCat[path.parse(url).name] || "extract"),
                {
                    sourceFile: assetSrcPath,
                    attrName: url
                });
            }
        };

        /**
         * attr href
         */
        dom.querySelectorAll('*[href]').forEach((elem) => {
            const href = elem.getAttribute("href");

            switch (elem.tagName) {
                case "LINK":
                    switch (elem.getAttribute("rel")) {
                        case "canonical":
                            break;
                        case "stylesheet":
                            addAssetURLByDomElem(storeAssetUrl(href, "stylesheets"),
                            {
                                domElem: elem,
                                attrName: "href"
                            });
                            retrieveURLs(href).catch(err => {
                                console.error(err);
                                process.exit(0);
                            });
                            break;
                        case "icon":
                        case "shortcut icon":
                        case "apple-touch-icon":
                            addAssetURLByDomElem(storeAssetUrl(href, "icons"),
                            {
                                domElem: elem,
                                attrName: "href"
                            });
                            break;
                        default:
                    }
                    break;
                case "A":
                    if (href.indexOf("#") === 0 || (href.indexOf(":") > 0 && !href.startsWith("http"))) {
                        Log.debug("CRAWLER SKIP " + page.url + " => " + href);
                    } else {
                        addAssetURLByDomElem(storeAssetUrl(href, "a"),
                        {
                            domElem: elem,
                            attrName: "href"
                        });
                    }
                    break;
                case "AREA":
                case "BASE":
                default:
            }
        });

        /**
         * attr src
         */
        dom.querySelectorAll('*[src]').forEach((elem) => {
            const src = elem.getAttribute("src");
            switch (elem.tagName) {
                case "AUDIO":
                    addAssetURLByDomElem(storeAssetUrl(src, "audios"),
                    {
                        domElem: elem,
                        attrName: "src"
                    });
                    break;
                case "IMG":
                    addAssetURLByDomElem(storeAssetUrl(src, "images"),
                    {
                        domElem: elem,
                        attrName: "src"
                    });
                    break;
                case "SCRIPT":
                    addAssetURLByDomElem(storeAssetUrl(src, "scripts"),
                    {
                        domElem: elem,
                        attrName: "src"
                    });
                    break;
                case "VIDEO":
                    addAssetURLByDomElem(storeAssetUrl(src, "videos"),
                    {
                        domElem: elem,
                        attrName: "src"
                    });
                    break;
                case "EMBED":
                case "IFRAME":
                //da memorizzare e dividerlo in link interni o link esterni.
                case "INPUT":
                case "TRACK":
                case "SOURCE":
                    //usato in video audio picture, track
                default:
            }
        });

        /**
         * attr content
         */
        dom.querySelectorAll('*[content]').forEach((elem) => {
            switch (elem.tagName) {
                case "META":
                    const property  = elem.getAttribute("property") || elem.getAttribute("name") || "";
                    const content   = elem.getAttribute("content");

                    if(property.endsWith(":image")) {
                        addAssetURLByDomElem(storeAssetUrl(content, "images"),
                        {
                            domElem: elem,
                            attrName: "content"
                        });
                    } else if(property.endsWith(":video")) {
                        addAssetURLByDomElem(storeAssetUrl(content, "videos"),
                        {
                            domElem: elem,
                            attrName: "content"
                        });
                    } else if(property.endsWith(":audio")) {
                        addAssetURLByDomElem(storeAssetUrl(content, "audios"),
                        {
                            domElem: elem,
                            attrName: "content"
                        });
                    } else {
                        addAssetURLByDomElem(storeAssetUrl(content, "meta"),
                        {
                            domElem: elem,
                            attrName: "content"
                        });
                    }
                    break;
                case "DATA":
                    break;
                case "TIME":
                    break;
                case "PROGRESS":
                    break;
                case "METER":
                    break;
                case "COMMAND":
                    break;
                case "MENUITEM":
                    break;
                default:
            }
        });

        /**
         * attr style
         */
        const elements              = dom.querySelectorAll('*[style]');
        const inlineStyles    = [...elements].map(element => element.getAttribute('style')).join('; ');
        retrieveURLs(page.webUrl, inlineStyles).catch(err => {
            console.error(err);
            process.exit(0);
        });

        /**
         * attr with asset
         */
        attrAssetMap.forEach((attr) => {
            dom.querySelectorAll(`*[${attr}]`).forEach((elem) => {
                addAssetURLByDomElem(storeAssetUrl(elem.getAttribute(attr), "assetMap"),
                {
                    domElem: elem,
                    attrName: attr
                });
            });
        });

        return assetURLs;
    };

    return {
        scrape : ({
                      attrAssetMap          = [],
                      onRetrieveAssets      = () => {},
                  }
        ) => {
            const assetsByType = getAssetsByType(attrAssetMap);

            onRetrieveAssets(assetsByType, dom);

            return {
                dom: dom,
                assets: assetsByType
            };
        }
    }
}