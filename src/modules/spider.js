import path from "path";
import fs from "fs";
import {CHARSET, documentRoot, project, projectPath, SEP} from "../constant.js";
import HTMLParser from "node-html-parser";
import fetch from "node-fetch";
import {crawler} from "./crawler.js";
import {Log, Stats} from "./log.js";
import * as clone from "./clone.js";

export class Page {
    url                 = null;
    isWeb               = false;
    sourceRoot          = null;
    pathName            = null;
    extension           = null;
    name                = null;
    webUrl              = null;

    src = {
        rootDir : projectPath + SEP + "src",
        filePath : null,
        webUrl: null,
        getFilePath(webUrl) {
            return project.srcPath(webUrl);
        },
        getWebUrl(filePath) {
            return filePath.replace(projectPath + SEP + "src", "");
        }
    }
    dist = {
        rootDir : projectPath + SEP + "dist",
        filePath : null,
        webUrl: null,
        getFilePath(webUrl) {
            return project.distPath(webUrl);
        },
        getWebUrl(filePath) {
            return filePath.replace(projectPath + SEP + "dist", "").replace(SEP + 'index.html', '') || SEP;
        }
    }
    local = {
        rootDir : projectPath + SEP + "local",
        filePath : null,
        webUrl: null,
        getFilePath(webUrl) {
            return project.localPath(webUrl);
        },
        getWebUrl(filePath) {
            return filePath.replace(projectPath + SEP + "local", "").replace(SEP, '');
        }
    }
    constructor(url) {
        this.url                    = url
                                        .replace(/\/{2,}/g, '/')
                                        .replace(/\/index\/$/, '/index');
        this.isWeb                  = this.url.indexOf('http') === 0 || this.url.indexOf('file://') === 0;
        if (this.isWeb) {
            const url               = new URL(this.url);

            this.sourceRoot         = url.origin;
            this.pathName           = (url.pathname.endsWith(SEP)
                                        ? url.pathname.slice(0, -1)
                                        : (path.dirname(url.pathname) !== SEP ? path.dirname(url.pathname) : '')
                                    );
            this.extension          = path.extname(url.pathname);
            this.name               = path.basename(url.pathname, this.extension);
            this.webUrl             = url.pathname + (url.pathname.endsWith(SEP)
                                        ? "index.html"
                                        : (this.extension ? "" : ".html")
                                    );

        } else {
            const sourceRoot        = ["src", "dist", "local"].find(env => this.url.startsWith(projectPath + SEP + env));

            this.sourceRoot         = sourceRoot ? projectPath + SEP + sourceRoot : documentRoot;
            this.pathName           = path.dirname(this.url).replace(this.sourceRoot, '');
            this.extension          = path.extname(this.url);
            this.name               = path.basename(this.url, this.extension);
            this.webUrl             = this.url.replace(this.sourceRoot, '') + (this.url.endsWith(SEP) ? "index.html" : (this.extension ? "" : ".html"));
        }

        this.src.filePath       = project.srcPath(this.webUrl);
        this.src.webUrl         = "";
        this.dist.filePath      = project.distPath(this.webUrl);
        this.dist.webUrl        = this.webUrl.replace(SEP + 'index.html', '') || SEP;
        this.local.filePath     = project.localPath(this.webUrl);
        this.local.webUrl       = this.webUrl.replace(SEP, '');
    }

    getDom() {
        return HTMLParser.parse(
            this.isWeb
                ? /*await*/ fetch(this.url).then(res => res.text()) //todo: da sistemare l'async perche il fetch cosi non funziona
                : fs.readFileSync(this.url, { encoding: CHARSET})
        )
    }
}

export function spider(urls = []) {
    let promises    = [];
    let urlsCrawled = [];
    let urlsCloned  = [];

    if (!Array.isArray(urls)) {
        urls = [urls];
    }
    const crawl = (page, options) => {
        const cpAsset = (src, {onSave = () => {}, onError = () => {}}) => {
            if(!src) {
                onError();
                return "";
            }
            const dst     = page.src.getFilePath(src.replace(page.sourceRoot, ""))
            const methodSave    = (
                page.isWeb || src.startsWith('http')
                    ? clone.saveFetch
                    : clone.saveFile
            );

            promises.push(methodSave(dst, src)
                .then(onSave)
                .catch(onError)
            );

            Stats.save(page.src.filePath, "assets", dst);
            Stats.save(dst, "pages", page.src.filePath);

            return dst;
        }

        urlsCrawled.push(page.url);

        /**
         * Crawler->Scrape
         */
        Log.debug(`CRAWLER ${page.url}`);
        Log.write(`Copy HTML ${page.url}`);
        const pageCrawled = crawler(page).scrape({
            attrAssetMap: options.attrAssetMap,
            onRetrieveAssets: (assets) => {
                for (let [assetUrl, assetData] of Object.entries(assets.raw)) {
                    const assetDstPath = cpAsset(assetUrl, {
                        onError: () => {
                            const source = [];
                            let error = "";
                            assetData.forEach(data => {
                                if(data.sourceFile) {
                                    source.push(data.sourceFile);
                                } else {
                                    const from = data.domElem.toString();
                                    error += "\n  " + (from.substring(0, from.indexOf('>') + 1) || from);
                                }
                            });

                            if (!assetUrl) {
                                Log.error(`- ASSET: Empty --> ${source.join("  ") || page.url} ${error}`);
                            } else {
                                Log.error(`- ASSET: Not Found (${assetUrl}) --> ${source.join("  ") || page.url} ${error}`);
                            }
                        }
                    });

                    assetData.forEach(data => {
                        data.domElem && data.domElem.setAttribute(data.attrName, page.src.getWebUrl(assetDstPath));
                    });
                }
            },
        });

        urlsCloned.push(page.src.filePath);
        promises.push(clone.saveData(page.src.filePath, pageCrawled.dom.toString()));

        /**
         * Crawl unique internal URLs
         */
        pageCrawled.assets.html.forEach(href => {
            urlsCrawled.includes(href) || crawl(new Page(href), options);
        });
    }

    return {
        clone : async (options = {
            attrAssetMap: []
        }) => {
            Stats.clean();
            Log.clean();
            Log.track(project.name.toUpperCase());

            urls.forEach(url => {
                crawl(new Page(url), options);
            });

            return Promise.all(promises).then(() => {
                Log.report(`Project: ${project.name} Cloned! (stored in ${project.srcPath()})`);
                Stats.log("clone");

                return urlsCloned;
            }).catch(err => {
                console.error(err);
                process.exit(0);
            });
        }
    }
}