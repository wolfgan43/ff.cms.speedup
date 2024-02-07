import path from "path";
import {Log} from "../libs/log.js";
import {CHARSET, DOT, SEP} from "../constant.js";
import fetch from "node-fetch";
import fs from "fs";

const _assetsURLs       = {};
const _filenameByCat    = {};

export async function crawler(page) {
    const dom = await page.getDom();
    const getAssetsByType = (attrAssetMap = []) => {

        const assetURLs = {
            html: [],
            link: [],
            images: [],
            icons: [],
            stylesheets: [],
            scripts: [],
            fonts: [],
            audios: [],
            videos: [],
            others: [],
            dom: {},
            source: {},
            embed: {
                scripts: [],
                styles: [],
            },
            system: {
                scripts: [],
                styles: [],
            },
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
        const storeAsset = (domElem, key) => {
            assetURLs.embed[key].push(domElem);
        };
        const storeAssetUrl = (url, key) => {
            const pushAssetUrl = (url, key) => {
                const assetUrl = url.startsWith(page.sourceRoot) ? url : resolveSrcPath(url);
                assetURLs[key].includes(assetUrl) || assetURLs[key].push(assetUrl);

                return assetUrl;
            }
            const resolvePageHtml = (link) => {
                if (page.isWeb
                    && link.match(new RegExp("^(http|https|file):\/\/(www\\.)?" + page.sourceRoot))
                ) {
                    return link;
                }

                if (!/^[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=]+$/.test(link)) {
                    Log.debug("STORE ASSET SKIP (NOLINK) " + page.url + " => " + link);
                    return;
                }
                if(link.startsWith(DOT + SEP)) {
                      link = link.substring(2)
                }
                const cleanUrl = link.replace(/\?.*$/, "").replace(/#.*$/, "");
                const linkExt = path.extname(cleanUrl);
                const extUrl = (linkExt === "" ? page.extension : "");
                const url = (
                    link.startsWith(SEP)
                        ? page.sourceRoot
                        : page.sourceRoot + page.pathName
                ) + (cleanUrl.startsWith(SEP) || cleanUrl.length === 0 ? cleanUrl : SEP + cleanUrl);

                if (!["", ".html", ".htm"].includes(linkExt)) {
                    Log.debug("STORE ASSET SKIP (NOHTML)" + page.url + " => " + link);
                    return;
                }

                if (cleanUrl.indexOf(":") > 0) {
                    Log.debug("STORE ASSET SKIP (EXTERNAL)" + page.url + " => " + link);
                    return;
                }

                if (page.isWeb
                    && link.indexOf(":") === -1
                    && cleanUrl.length > 0
                ) {
                    return link;
                } else if (!page.isWeb
                    && fs.existsSync(url + extUrl)
                    && cleanUrl.length > 0
                ) {
                    return url + extUrl;
                } else if (!page.isWeb
                    && linkExt === "" && fs.existsSync(url + SEP + "index" + page.extension)
                ) {
                    return url + SEP + "index" + page.extension;
                }

                Log.debug("NO ASSET " + page.url + " => " + link);

            }

            const ext = path.extname(url);
            const isExternal = url.startsWith("http") || url.startsWith("//");

            const support = {
                images: [".jpg", ".jpeg", ".gif", ".png", ".webp", ".svg"],
                fonts: [".ttf", ".otf", ".woff", ".woff2", ".eot", ".svg"],
                icons: [".ico", ".svg"],
                stylesheets: [".css"],
                scripts: [".js"],
                videos: [".mp4", ".ogv", ".mpg", ".mpeg", ".avi", ".webm"],
                audios: [".mp3", ".ogg", ".wav", ".aac", ".webm"],
                others: [
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
            } else if (support[key] && (isExternal || support[key].includes(ext))) {
                return pushAssetUrl(url, key);
            } else if ((pageHtmlUrl = resolvePageHtml(url))) {
                Log.debug("FIND HTML: " + page.url + " => " + url + " => " + pageHtmlUrl);
                assetURLs.html.includes(pageHtmlUrl) || assetURLs.html.push(pageHtmlUrl);
                return pageHtmlUrl;
            } else if (["", ".html", ".htm"].includes(path.extname(url))) {
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
        const isAbsoluteURL = (url) => {
            return url.startsWith(SEP) || url.startsWith(DOT + SEP) || url.startsWith('http');
        };
        const resolveSrcPath = (asset) => {
            if (asset.startsWith('http')) {
                return asset;
            } else if (isAbsoluteURL(asset)) {
                return page.sourceRoot + asset;
            } else {
                return page.sourceRoot + page.pathName + SEP + asset;
            }
        };

        const retrieveURLs = async (asset, data = null) => {
            const assetSrcPath = resolveSrcPath(asset);

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
                const dictExt = {
                    ".ttf": "fonts",
                    ".otf": "fonts",
                    ".woff": "fonts",
                    ".woff2": "fonts",
                    ".eot": "fonts",
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
                addAssetURLByDomElem(storeAssetUrl(isAbsoluteURL(url) ? url : path.dirname(assetSrcPath) + SEP + url, _filenameByCat[path.parse(url).name] || "extract"),
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
                            //TODO: da verificare bene perche non si puo mettere dentro al then
                            addAssetURLByDomElem(storeAssetUrl(href, "stylesheets"),
                            {
                                domElem: elem,
                                attrName: "href"
                            });
                            retrieveURLs(href).catch(error => {});
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
                    switch (elem.parentNode.tagName) {
                        case "VIDEO":
                            addAssetURLByDomElem(storeAssetUrl(src, "videos"),
                                {
                                    domElem: elem,
                                    attrName: "src"
                                });
                            break;
                        case "AUDIO":
                            addAssetURLByDomElem(storeAssetUrl(src, "audios"),
                                {
                                    domElem: elem,
                                    attrName: "src"
                                });
                            break;
                        case "PICTURE":
                            addAssetURLByDomElem(storeAssetUrl(src, "images"),
                                {
                                    domElem: elem,
                                    attrName: "src"
                                });
                            break;
                        default:
                    }
                    break;
                default:
            }
        });

        /**
         * attr poster
         */
        dom.querySelectorAll('*[poster]').forEach((elem) => {
            const poster = elem.getAttribute("poster");
            switch (elem.tagName) {
                case "VIDEO":
                    addAssetURLByDomElem(storeAssetUrl(poster, "images"),
                        {
                            domElem: elem,
                            attrName: "poster"
                        });
                    break;
                default:
            }
        });

        /**
         * attr content
         */
        dom.querySelectorAll('*[content]').forEach((elem) => {
            switch (elem.tagName) {
                case "META":
                    const property = elem.getAttribute("property") || elem.getAttribute("name") || "";
                    const content = elem.getAttribute("content");

                    if (property.endsWith(":image")) {
                        addAssetURLByDomElem(storeAssetUrl(content, "images"),
                            {
                                domElem: elem,
                                attrName: "content"
                            });
                    } else if (property.endsWith(":video")) {
                        addAssetURLByDomElem(storeAssetUrl(content, "videos"),
                            {
                                domElem: elem,
                                attrName: "content"
                            });
                    } else if (property.endsWith(":audio")) {
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
         * script tag without src
         */
        dom.querySelectorAll('script:not([src]):not([type]), script[type="text/javascript"]:not([src])').forEach((elem) => {
            const content = elem.textContent || elem.innerText;
            if (content && !content.includes('google')) {
                storeAsset(elem, "scripts");
            }
        });

        /**
         * style tag
         */
        dom.querySelectorAll('style').forEach((elem) => {
            storeAsset(elem, "styles");
        });

        /**
         * attr style
         */
        const inlineStyles = [];
        dom.querySelectorAll('*[style]').forEach((elem) => {
            inlineStyles.push(elem.getAttribute('style'));
            storeAsset(elem, "styles");
        });
        retrieveURLs(page.webUrl, inlineStyles.join('; ')).catch(error => {
            Log.error(`- HTML: ${error.message} (${page.webUrl})`);
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
        scrape: ({
                     attrAssetMap = [],
                     onRetrieveAssets = () => {
                     },
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