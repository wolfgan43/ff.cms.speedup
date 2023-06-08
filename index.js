//import cssPurge from 'css-purge';
//import  PurgeCSS from 'purgecss';
import * as criticalCSS from "critical";

//import {PurgeCSS} from "purgecss";
//import critical from 'critical';

//process.setMaxListeners(0);




import * as clone from "./src/modules/clone.js";

import * as css  from "./src/modules/css.js";

import {CSS_EXT, documentRoot, FONTS_EXT, HTML_EXT, IMAGES_EXT, projectPath, SEP} from "./src/constant.js";
import {Log, Stats} from "./src/modules/log.js";
import {crawler} from "./src/modules/crawler.js";
import {spider} from "./src/modules/spider.js";
import {seo} from "./src/modules/seo.js";
import emitter from "events";



/*
const purgeCSSResults = new PurgeCSS().purge({
    content: [documentRoot + "index.html"],
    css: [documentRoot + "assets/css/*.css"]
});

console.log(purgeCSSResults);*/

const options = {
    seo: {
        content: {

        },
        architecture: {

        },
        html: {

        }
    },
    img: {
        lazy: true,
        alt: true,
        title: true,
        webp: true,
        resize: false,
        mediaQuery: false
    },
    html: {
        minify : false
    },
    css: {
        async: true,
        purge: {
            safeClasses: ['sticky-navbar', /^slicknav/, 'show', 'b24-form-sign-abuse-info', 'b24-form-sign-info'],
            blockClasses: []
        },
        minify: true,
        critical: true,
        combine: false,
    },
    js: {
        async: true,
        purge: false,
        minify: true,
        combine: false,
    },
};
//let promises = [];

spider([documentRoot + SEP + "index.html", documentRoot + SEP + "404.html"])
    .clone({attrAssetMap : ["data-image-src"]})
    .then((urlsCloned) => {
        emitter.setMaxListeners(20);
        seo(urlsCloned).speedUp(options)
            .then((cose) => {
               // console.log(Stats.report());
                console.log(cose);
            });
    });
//crawler(documentRoot + SEP + "index.html").scrape({assetAttributes : ["data-image-src"]})

/*
clone.findSync({
    srcPath: documentRoot,
    filterExt: [HTML_EXT],
    callback: (srcFilePath) => {
        promises = promises.concat(crawler({htmlSource: srcFilePath}).scrape(["data-image-src"])
            );

    }
}).then((scan) => {
   // console.log("ssssssssssss", promises.length);
    Promise.all(promises).then(() => {
        console.log(scan);
       // Log.report();
       // console.log(Stats.report());
    });
});
*/

//Promise.all(promises).then(() => {
   // console.log(Stats.report());
//});


/*


clone.cp({
    filterExt: [...FONTS_EXT],
});



if (options.css.purge) {
    const stylesheets = await css.purgeFiles({
        safeClasses: options.css.purge.safeClasses,
        blockClasses: options.css.purge.blockClasses,
    });



} else {
    clone.cp({
        filterExt: [CSS_EXT],
    });
}


clone.cp({
    filterExt: [HTML_EXT],
    callback: ({dstFilePath, srcFilePath}) => {
        html({htmlSource: dstFilePath}).speedUp(options);
    }
});


*/