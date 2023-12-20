import {CHARSET, documentRoot, DOT, SEP} from "./src/constant.js";
import {spider} from "./src/modules/spider.js";
import {seo} from "./src/modules/seo.js";
import emitter from "events";
import fs from "fs";

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

const options = loadOptions();

spider(options)
    .clone()
    .then((urlsCloned) => {
        emitter.setMaxListeners(20);
        seo(urlsCloned).speedUp(options)
            .then((cose) => {
                console.log(cose);
            });
    });