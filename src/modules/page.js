import {CHARSET, documentRoot, DOT, project, cachePath, SEP} from "../constant.js";
import path from "path";
import HTMLParser from "node-html-parser";
import fetch from "node-fetch";
import fs from "fs";
import {getRenderedImageDimensions} from "./seo/image.js";
import puppeteer from "puppeteer";
import {Console} from "../libs/log.js";

export function normalizeUrl(url) {
    return url
        .replace(/([^.])\.\//g, '$1')
        .replace(/\/{2,}/g, '/')
        .replace(/\/index\/$/, '/index');
}

export const resolvePath = path => {
    return path
        .replaceAll(SEP + DOT + SEP, SEP)
        .replace(/\/+/g, '/')
        .split(SEP)
        .reduce((resolved, part) => {
            if (part === DOT + DOT && resolved.length > 0) {
                resolved.pop();
            } else {
                resolved.push(part);
            }
            return resolved;
        }, []).join(SEP);
};

async function renderPage(url, callback = async () => {}) {
    // Launch Puppeteer browser
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: project.options.chromePath,
    });

    try {
        const page = await browser.newPage();

        await page.goto(url);
        await callback(page);
    } finally {
        await browser.close();
    }
}

export class Page {
    url                 = null;
    isWeb               = false;
    sourceRoot          = null;
    pathName            = null;
    extension           = null;
    name                = null;
    webUrl              = null;
    images          = {};

    src = {
        parent: null,
        rootDir : cachePath + SEP + "src",
        filePath : null,
        webUrl: null,
        getFilePath(webUrl) {
            if (webUrl.startsWith("http")) {
                return webUrl;
            }
            return this.rootDir + webUrl.replace(this.parent.sourceRoot, "");
        },
        getWebUrl(filePath) {
            return resolvePath(filePath.replace(this.rootDir, ""));
        }
    }
    dist = {
        parent: null,
        rootDir : documentRoot + SEP + "dist",
        filePath : null,
        webUrl: null,
        getFilePath(webUrl) {
            return this.rootDir + webUrl.replace(this.parent.sourceRoot, "");
        },
        getWebUrl(filePath) {
            return resolvePath(filePath.replace(this.rootDir, ""));
        }
    }

    constructor(url) {
        this.url                    = resolvePath(url);
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
            const sourceRoot        = ["src", "dist"].find(env => this.url.startsWith(cachePath + SEP + env));

            this.sourceRoot         = sourceRoot ? cachePath + SEP + sourceRoot : documentRoot;
            this.pathName           = path.dirname(this.url).replace(this.sourceRoot, '');
            this.extension          = path.extname(this.url);
            this.name               = path.basename(this.url, this.extension);
            this.webUrl             = this.url.replace(this.sourceRoot, '') + (this.url.endsWith(SEP) ? "index.html" : (this.extension ? "" : ".html"));
        }

        this.src.parent         = this;
        this.dist.parent        = this;

        this.src.filePath       = project.srcPath(this.webUrl);
        this.src.webUrl         = "";
        this.dist.filePath      = project.distPath(this.webUrl);
        this.dist.webUrl        = this.webUrl.replace(SEP + 'index.html', '') || SEP;
    }

    async getDom(pageRender = false) {
        const url = this.isWeb
            ? this.url
            : path.resolve(this.url);

        const html = this.isWeb
            ? await fetch(url).then(res => res.text())
            : fs.readFileSync(url, { encoding: CHARSET});

        if (!html) {
            throw new Error(`Page ${this.url} empty`);
        }

        if (pageRender && project.options.img.responsive) {
            await renderPage(url, async page => {
                this.images = await getRenderedImageDimensions(page);
            });
        }

        return HTMLParser.parse(html);
    }
}