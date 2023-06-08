import fs from "fs";
import path from "path";
import sharp from "sharp";

import puppeteer from 'puppeteer';

export async function setRenderedDimensions(url) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto("https://www.consul-etica.it/");
    const supportedMediaQueries = await page.evaluate(() => {
        // Ottieni tutte le media query supportate
        const mediaQueries = window.matchMedia('');

        // Filtra solo le media query che sono supportate
        const supportedQueries = Array.from(mediaQueries).filter(query => query.matches)
            .map(query => query.media);

        return supportedQueries;
    });

    console.log('Media query supportate:', supportedMediaQueries);

    const mediaQueries = [
        '(max-width: 576px)',
        '(min-width: 576px) and (max-width: 768px)',
        '(min-width: 768px) and (max-width: 992px)',
        '(min-width: 992px) and (max-width: 1200px)',
        '(min-width: 1200px)',
    ];

    const images = page.$$eval('img', (elements) =>
        elements.map((img) => ({
            src: img.src,
            width: img.offsetWidth,
            height: img.offsetHeight,
            srcset: []
        }))
    );
    for (const query of mediaQueries) {
        await page.setViewport({ width: 500, height: 600 }); // Imposta la dimensione dello schermo desiderata

        // Esegui il rendering della pagina HTML con la media query specificata
        await page.emulateMediaType('screen');
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
        //await page.emulateMedia(query);

        const renderedImages = await images;
        console.log(await images);

        // Imposta le dimensioni renderizzate e l'attributo srcset per ogni immagine
        for (const img of renderedImages) {
            const { src, width, height } = img;

            const srcset = `${src.replace(/(\.[^.]+)$/, `-${width}x${height}$1`)} ${width}w`;
            img.srcset.push(srcset);
            /*await page.$eval(`img[src="${src}"]`, (element) => {
                element.setAttribute('width', element.offsetWidth.toString());
                element.setAttribute('height', element.offsetHeight.toString());
                element.setAttribute('srcset', srcset);
            });*/
        }
        console.log(renderedImages);
    }

    // Ottieni il codice HTML aggiornato
    const updatedHtml = await page.content();

    await browser.close();

    return updatedHtml;
}

export async function optimize(imagePath, options = {
    webp: false,
    excludeExt : {
        webp: []
    },
}) {
    let imageExt = path.extname(imagePath);
    const imageFileName = path.basename(imagePath, imageExt);
    const imageBuffer = await fs.promises.readFile(imagePath);
    const image = sharp(imageBuffer);

    if (options.webp && !options.excludeExt.webp.includes(imageExt)) {
        imageExt = ".webp";
        image.webp({
            quality: 100,
            alphaQuality: 100,
            lossless: true,
            // nearLossless: 100, //non funzia
            smartSubsample: true,
            reductionEffort: 6,
        });
    }
    return {
        imageBaseName: imageFileName + imageExt,
        buffer : await image.toBuffer(),
        metadata: await image.metadata()
    };
}