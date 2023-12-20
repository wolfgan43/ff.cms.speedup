import {documentRoot, project} from "../constant.js";
import {crawler} from "./crawler.js";
import {Log, Stats} from "./log.js";
import * as clone from "./clone.js";
import {normalizeUrl, Page} from "./page.js";

export function spider() {
    let promises    = [];
    let urlsCrawled = [];
    let urlsCloned  = [];
    let parentCrawl = null;

    const crawl = async (page) => {
        const cpAsset = (src, {onSave = () => {}, onError = () => {}}) => {
            if(!src) {
                onError();
                return "";
            }
            if (src.startsWith("http")) {
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
        try {
            Log.write(`Copy HTML  ${page.url}`);

            const pageCrawled = (await crawler(page)).scrape({
                attrAssetMap: project.options.attrAssetMap,
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
                                    clone.touch(page.src.getFilePath(assetUrl));
                                    Log.error(`- ASSET: Not Found (${assetUrl}) --> ${page.url} ${error}`);
                                }
                            }
                        });
                        if (assetDstPath) {
                            assetData.forEach(data => {
                                data.domElem && data.domElem.setAttribute(data.attrName, page.src.getWebUrl(assetDstPath));
                            });
                        }
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

            for (const href of pageCrawled.assets.html) {
                urlsCrawled.includes(normalizeUrl(href)) || (await crawl(new Page(href)));
            }
        } catch (e) {
            Log.error(`Empty HTML ${page.url} (from ${parentCrawl})`);
        }
    }

    return {
        clone : async () => {
            Stats.clean();
            Log.clean(true);
            clone.deleteProject("src");

            for (const url of project.options.urls) {
                parentCrawl = documentRoot + url;

                await crawl(new Page(parentCrawl));
            }

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