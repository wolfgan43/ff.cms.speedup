import fs from "fs";
import path from "path";
import sharp from "sharp";
import * as svgo from "svgo";
import {DOT, project, screenResolutions, SEP} from "../../constant.js";

const getNoImage = () => {
    return fs.readFileSync(DOT + SEP + "no-image.webp");
}
const img = (imagePath, options = {
    webp: false,
}) => {
    const imageExt = path.extname(imagePath);
    const imageFileName = path.basename(imagePath, imageExt);
    const imageBuffer = fs.readFileSync(imagePath);
    const image = sharp(imageBuffer.length > 0 ? imageBuffer : getNoImage());
    const imageFileExt = options.webp && ![".webp"].includes(imageExt) ? ".webp" : imageExt;

    const toBuffer = async (image) => {
        const webpOptions = {
            quality: 100,
            alphaQuality: 100,
            lossless: true,
            // nearLossless: 100, //non funzia
            smartSubsample: true,
            reductionEffort: 6,
        };
        return options.webp && ![".webp"].includes(imageExt)
            ? image.webp(webpOptions).toBuffer()
            : image.toBuffer();
    }

    return {
        imageBaseName: (width) => width
            ? imageFileName + "-" + width + imageFileExt
            : imageFileName + imageFileExt,
        buffer : (width = null, height = null) => toBuffer(width
            ? image.resize(width, height)
            : image),
        metadata: async () => await sharp(imageBuffer).metadata(),
        isResponsive    : true
    };
}
const svg = (imagePath) => {
    const imageBuffer = fs.readFileSync(imagePath);

    return {
        imageBaseName   : () => path.basename(imagePath),
        buffer          : async () => {
            const svgString = imageBuffer.toString();

            return svgo.optimize(svgString).data
        },
        metadata: async () => await sharp(imageBuffer).metadata(),
        isResponsive    : false
    };
}

export function optimize(imagePath, options = {
    webp: false,
}) {
    switch (path.extname(imagePath)) {
        case ".svg":
            return svg(imagePath);
        default:
            return img(imagePath, options);
    }
}


export async function getRenderedImageDimensions(page) {
    const imageData = {};

    // Wait for images to load
    await page.waitForSelector('img');

    // Get all image elements
    const images = await page.$$('img');
    for (const image of images) {
        const imageUrl = (await image.evaluate(img => {
            img.removeAttribute("width");
            img.removeAttribute("height");
            return img.src;
        })).replace('file:///', '');

        const responsive = [];
        for (const viewport of screenResolutions) {
            await page.setViewport(viewport);
            responsive.push(await image.evaluate(img => ({
                width: img.offsetWidth,
                height: img.offsetHeight,
            })));
        }

        imageData[imageUrl] = responsive;
    }

    return imageData;
}


