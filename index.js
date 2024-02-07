import {spider} from "./src/modules/spider.js";
import {seo} from "./src/modules/seo.js";
import emitter from "events";
import {generateSitemap} from "./src/modules/seo/sitemap.js";

spider()
    .clone()
    .then((urlsCloned) => {
        //emitter.setMaxListeners(20);
        seo(urlsCloned).speedUp()
            .then((resources) => {
                resources.htmlOptimized && generateSitemap(resources.htmlOptimized);
            });
    });