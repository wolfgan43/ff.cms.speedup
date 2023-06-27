import {CHARSET, documentRoot, DOT, project, projectPath, SEP} from "../constant.js";
import path from "path";
import HTMLParser from "node-html-parser";
import fetch from "node-fetch";
import fs from "fs";

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
        rootDir : projectPath + SEP + "src",
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
        rootDir : projectPath + SEP + "dist",
        filePath : null,
        webUrl: null,
        getFilePath(webUrl) {
            return this.rootDir + webUrl.replace(this.parent.sourceRoot, "");
        },
        getWebUrl(filePath) {
            return resolvePath(filePath.replace(this.rootDir, "").replace(SEP + 'index.html', '')) || SEP;
        }
    }
    local = {
        parent: null,
        rootDir : projectPath + SEP + "local",
        filePath : null,
        webUrl: null,
        getFilePath(webUrl) {
            return this.rootDir + webUrl.replace(this.parent.sourceRoot, "");
        },
        getWebUrl(filePath, ext = null, filename = null) {
            const relativeUrl = filePath.replace(/(.*?)([?#].*)?$/, (match, pathname, params) => {
                if (filename && pathname.endsWith(SEP) ) {
                    pathname += filename;
                }
                if (ext && path.extname(pathname) === '') {
                    pathname += ext;
                }

                return pathname + (params || "");
            }).replace(/^\/+/, '');

            return (DOT + DOT + SEP).repeat((this.webUrl.match(new RegExp(SEP, 'g')) || []).length)
                + relativeUrl;
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

        this.src.parent         = this;
        this.dist.parent        = this;
        this.local.parent       = this;

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