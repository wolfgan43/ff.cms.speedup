import puppeteer from 'puppeteer';
import {project, screenResolutions} from "../../constant.js";
import path from "path";


export async function getRenderedImageDimensions2(url) {
    const imageData = {};

    // Launch Puppeteer browser
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: project.options.chromePath,
    });

    try {
        // Open a new page
        const page = await browser.newPage();

        // load the page
        await page.goto(url);

        const html = await page.content();

        // Wait for images to load
        await page.waitForSelector('img');

        // Get all image elements
        const images = await page.$$('img');
        for (const image of images) {
            const imageUrl = (await image.evaluate(img => {
                img.removeAttribute("width");
                img.removeAttribute("height");
                return img.src;
            })).replace('file:///', '')
                .replace(path.resolve(project.srcPath()).replaceAll('\\', '/'), '');

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

        return {
            html: html,
            images: imageData,
        };
    } finally {
        await browser.close();
    }
}