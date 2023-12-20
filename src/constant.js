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
export const projectName   = args[1] ?? path.resolve(documentRoot).replace(/\\/g, SEP).split(SEP).pop();
export const cachePath   = DOT + SEP + "cache" + SEP + projectName;
export const srcAssetPath  = documentRoot + ASSET_PATH;

const loadOptions = () => {
    const getProjectOptions = () => {
        return fs.existsSync(documentRoot + SEP + '.optim.json') ?
            JSON.parse(fs.readFileSync(documentRoot + SEP + '.optim.json'), {encoding: CHARSET})
            : {};
    }

    try {
        return {...JSON.parse(fs.readFileSync(DOT + SEP + 'options.json'), {encoding: CHARSET}), ...getProjectOptions()};
    } catch (error) {
        console.error('Errore durante la lettura del file options.json', error);
        process.exit(1);
    }
}

export const project = {
    name : projectName,
    cachePath: cachePath,
    documentRoot: documentRoot,
    options: loadOptions(),
    srcPath: (path = "") => {
        return cachePath + SEP + "src" + path
    },
    distPath: (path = "") => {
        return documentRoot + SEP + "dist" + path
    },
    distWebUrl(filePath) {
        const getUrl = () => {
            filePath = this.options.link.removeExtension.reduce((acc, ext) => acc.replace(new RegExp(`${ext}$`, 'i'), ''), filePath)
            if (this.options.link.removeIndex) {
                filePath = filePath.replace(/\/index(\.[a-zA-Z0-9]{2,5})?$/i, '/');
            }
            return filePath;
        }
        return getUrl().replace(documentRoot + SEP + "dist", "");
    }
};

if (!fs.existsSync(srcAssetPath)) {
    console.error(`ERR: Missing ${srcAssetPath} folder in your website`);
    process.exit();
}