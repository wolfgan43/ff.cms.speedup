import fs from "fs";
import path from "path";
import {CHARSET, JS_PATH, SEP} from "../../constant.js";
import {Log, Stats} from "../log.js";
import * as clone from "../clone.js";
import * as terser from "terser";

function minify(js) {
    return terser.minify(js).then(minified => {
        return minified.code;
    });
}

export function combine(scripts) {
    let js = "";

    scripts.forEach((script) => {
        js += fs.readFileSync(script, {encoding: CHARSET});
    });

    return js;
}

export function min(scripts, onSaveData = null) {
    for (const script of Stats.diffKeys(scripts, "scripts")) {
        Stats.save(script, "scripts", -1);

        if (script.startsWith("http")) {
            throw new Error("Can't minify remote file");
        }

        let minified = fs.readFileSync(script, {encoding: CHARSET});
        let scriptMin = script;

        if (path.basename(script).indexOf(".min.js") < 0) {
            minified = minify(minified);
            scriptMin = scriptMin.replace(".js", ".min.js");
        }
        const scriptFilePath = (onSaveData ? onSaveData(scriptMin) : scriptMin);

        Log.write(`JS Save Minified: ${script} --> ${scriptFilePath}`);
        clone.saveData(scriptFilePath, minified, "scriptsOptimized");
    }
}

export function save({script, filename, basePath, min = true}) {
    const jsFilePath    = basePath + JS_PATH + SEP + filename + (min ? ".min" : "") + ".js";

    clone.saveData(jsFilePath,
        min
            ? minify(script)
            : script
        , "scriptsOptimized"
    );

    return jsFilePath;
}