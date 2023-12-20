import {CHARSET, documentRoot, DOT, project, cachePath, SEP} from "../constant.js";
import path from "path";
import HTMLParser from "node-html-parser";
import fetch from "node-fetch";
import fs from "fs";

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
            if (part === DOT + DOT) {
                resolved.pop();
            } else {
                resolved.push(part);
            }
            return resolved;
        }, []).join(SEP);
};
export class Page {
    url                 = null;
    isWeb               = false;
    sourceRoot          = null;
    pathName            = null;
    extension           = null;
    name                = null;
    webUrl              = null;

    src = {
        parent: null,
        rootDir : cachePath + SEP + "src",
        filePath : null,
        webUrl: null,
        getFilePath(webUrl) {
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
            return resolvePath(filePath.replace(this.rootDir, "").replace(SEP + 'index.html', '')) || SEP;
        }
    }

    constructor(url) {
        this.url                    = normalizeUrl(url);
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
            const sourceRoot        = ["src", "dist", "local"].find(env => this.url.startsWith(cachePath + SEP + env));

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
    async getDom() {
        const html = this.isWeb
            ? await fetch(this.url).then(res => res.text())
            : fs.readFileSync(this.url, { encoding: CHARSET});

        if (!html) {
            throw new Error(`Page ${this.url} empty`);
        }

        return HTMLParser.parse(html);
    }
}