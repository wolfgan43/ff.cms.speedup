import {project} from "../constant.js";
import {crawler} from "./crawler.js";
import {Log, Stats} from "./log.js";
import * as clone from "./clone.js";
import {Page} from "./page.js";

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
            const dst     = page.src.getFilePath(src)
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
                for (const [assetUrl, assetData] of Object.entries(assets.dom)) {
                    const assetDstPath = cpAsset(assetUrl, {
                        onError: () => {
                            let error = "";
                            assetData.forEach(data => {
                                const from = data.domElem.toString();
                                error += "\n  " + (from.substring(0, from.indexOf('>') + 1) || from);
                            });

                            if (!assetUrl) {
                                Log.error(`- ASSET: Empty --> ${page.url} ${error}`);
                            } else {
                                Log.error(`- ASSET: Not Found (${assetUrl}) --> ${page.url} ${error}`);
                            }
                        }
                    });

                    assetData.forEach(data => {
                        data.domElem && data.domElem.setAttribute(data.attrName, page.src.getWebUrl(assetDstPath));
                    });
                }
                for (const [assetUrl, assetData] of Object.entries(assets.source)) {
                    cpAsset(assetUrl, {
                        onError: () => {
                            const source = [];
                            assetData.forEach(data => {
                                if(data.sourceFile) {
                                    source.push(data.sourceFile);
                                }
                            });

                            if (!assetUrl) {
                                Log.error(`- ASSET: Empty --> ${source.join("  ")}`);
                            } else {
                                Log.error(`- ASSET: Not Found (${assetUrl}) --> ${source.join("  ")}`);
                            }
                        }
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
            Log.clean(true);

            urls.forEach(url => {
                crawl(new Page(url), options);
            });

            return Promise.all(promises).then(() => {
                Log.report(`Cloned! (stored in ${project.srcPath()})`);
                Stats.log("clone");

                return urlsCloned;
            }).catch(err => {
                console.error(err);
                process.exit(0);
            });
        }
    }
}