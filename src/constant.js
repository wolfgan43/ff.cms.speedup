import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();
export const CHARSET        = 'utf8';
export const HTML_EXT       = 'html';
export const CSS_EXT        = 'css';
export const JS_EXT         = 'js';
export const IMAGES_EXT     = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'ico', 'webp'];
export const FONTS_EXT      = ['eot', 'ttf', 'woff', 'woff2'];

export const DOT            = '.';
export const SEP            = '/';
export const ASSET_PATH     = `${SEP}assets`;
export const HTML_PATH      = ``;
export const IMAGE_PATH     = `${ASSET_PATH + SEP}img`;
export const FONT_PATH      = `${ASSET_PATH + SEP}fonts`;
export const CSS_PATH       = `${ASSET_PATH + SEP}css`;
export const JS_PATH        = `${ASSET_PATH + SEP}js`;

export const HTML_REGEXP    = `${HTML_PATH + SEP}*.${HTML_EXT}`;
export const IMAGE_REGEXP   = `${IMAGE_PATH + SEP}*.[${IMAGES_EXT.join('|')}]`;
export const FONT_REGEXP    = `${FONT_PATH + SEP}*.[${FONTS_EXT.join('|')}]`;
export const CSS_REGEXP     = `${CSS_PATH + SEP}*.${CSS_EXT}`;
export const JS_REGEXP      = `${JS_PATH + SEP}*.${JS_EXT}`;



if (process.argv.length <= 2) {
    console.error('ERR: You must specify website document root');
    process.exit();
}
const args          = process.argv.slice(2);
export const documentRoot  = args[0];
export const projectName   = path.resolve(documentRoot).replace(/\\/g, SEP).split(SEP).pop();
export const projectPath   = DOT + SEP + "projects" + SEP + projectName;
export const sitePath      = args[1] || '';

export const srcAssetPath  = documentRoot + ASSET_PATH;

export const project = {
    name : projectName,
    basePath: projectPath,
    srcPath: (path = "") => {
        return projectPath + SEP + "src" + path
    },
    localPath: (path = "") => {
        return projectPath + SEP + "local" + path
    },
    distPath: (path = "") => {
        return projectPath + SEP + "dist" + path
    }
};

export function getSaveFilePath(path, bucket = SEP + "src") {
    return projectPath + bucket + path;
}

if (!fs.existsSync(srcAssetPath)) {
    console.error(`ERR: Missing ${srcAssetPath} folder in your website`);
    process.exit();
}