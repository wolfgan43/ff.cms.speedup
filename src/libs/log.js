import path from "path";
import fs from "fs";
import {project, cachePath, SEP} from "../constant.js";

const MACRO_EXT = {
    ".jpg"      : "image",
    ".jpeg"     : "image",
    ".png"      : "image",
    ".webp"     : "image",
    ".svg"      : "image",
    ".gif"      : "image",
    ".min.css"  : "stylesheet",
    ".css"      : "stylesheet",
    ".html"     : "html",
    ".htm"      : "html",
    ".min.js"   : "script",
    ".js"       : "script",
    ".eot"      : "font",
    ".woff"     : "font",
    ".ttf"      : "font",
}

let logs = {};
let logBucket = "default";
let logSeverity = {
    "errors": 0,
    "warning": 0,
    "info": 0,
};

let stats = {
    duplication : {},
    bucket: {},
    macroext: {},
    ext: {},
    tag: {}
};


const colors = {
    reset: '\x1b[0m',

    //text color
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',

    //background color
    blackBg: '\x1b[40m',
    redBg: '\x1b[41m',
    greenBg: '\x1b[42m',
    yellowBg: '\x1b[43m',
    blueBg: '\x1b[44m',
    magentaBg: '\x1b[45m',
    cyanBg: '\x1b[46m',
    whiteBg: '\x1b[47m'
};

const save = (msg, bucket = logBucket, severity = "info", color = null) => {
    logs[bucket] = logs[bucket] || [];

    return logs[bucket].push({
        msg: msg,
        severity: severity,
        color: color,
    });
}

export class Console {
    static log(msg) {
        process.stdout.write("\n " + msg);
    }
    static logSuccess(msg) {
        process.stdout.write(colors.green + msg + colors.reset);
    }

    static logError(msg) {
        process.stderr.write(colors.red + msg + colors.reset);
    }
    static LogWarn(msg) {
        process.stdout.write(colors.yellow + msg + colors.reset);
    }
}

export class Log {
    static track(bucket) {
        logBucket = bucket;
    }
    static write(msg, bucket = undefined) {
        save(msg, bucket, "info", colors.blue);
        logSeverity["info"]++;
    }
    static error(msg, bucket = undefined) {
        save(msg.replace(": ", " Err: "), bucket,"error", colors.red);
        logSeverity["errors"]++;
    }
    static warn(msg, bucket = undefined) {
        save(msg.replace(": ", " Warn: "), bucket, "warning", colors.yellow);
        logSeverity["warning"]++;
    }
    static debug(msg) {
        if (process.env.LOG_DEBUG === 'true') {
            process.stdout.write("\n " + msg);
        }
    }
    static console(bucket = logBucket) {
        function getColor(msg) {
            if (msg.toLowerCase().indexOf("err:") > -1) {
                return colors.red;
            } else if (msg.toLowerCase().indexOf("warn:") > -1) {
                return colors.yellow;
            } else if (msg.indexOf("-") === 0) {
                return colors.green;
            } else {
                return colors.blue;
            }
        }

        let logBucket = (logs[bucket] || []);
        if (!project.options.log.verbose) {
            logBucket = logBucket.filter(log => log.msg.toLowerCase().includes("err:") || log.msg.toLowerCase().includes("warn:"));
        }

        if (logBucket.length) {
            process.stdout.write("\n");
            process.stdout.write("=".padStart(process.stdout.columns, "=") + "\n");
            process.stdout.write(bucket.padStart((process.stdout.columns + bucket.length) / 2, " ") + "\n");
            process.stdout.write("-".padStart(process.stdout.columns, "-") + "\n");

            logBucket.forEach((log) => {
                if (log.msg.indexOf(":") > -1) {
                    const arrMsg = log.msg.split(":");
                    const title = arrMsg.shift() + ":";
                    const desc = arrMsg.join(":");
                    console.log((log.color || getColor(log.msg)) + '%s' + colors.reset, title.padEnd(12, " "), desc);
                } else if (log.color) {
                    console.log(log.color + '%s' + colors.reset, log.msg);
                } else {
                    console.log(log.msg);
                }
            });
        }
    }
    static report(title, severity = []) {
        title = `Project: ${project.name} ${title}`;
        Object.keys(logs).forEach((bucket) => {
            Log.console(bucket);
        });
        process.stdout.write("-".padStart(process.stdout.columns, "-") + "\n");
        process.stdout.write(title + (
                colors.blue + ("info: " + logSeverity["info"]).padEnd(15, " ") +
                colors.red + ("errors: " + logSeverity["errors"]).padEnd(15, " ") +
                colors.yellow + ("warning: " + logSeverity["warning"]) + colors.reset
            ).padStart(process.stdout.columns - title.length) + "\n"
        );
        process.stdout.write("=".padStart(process.stdout.columns, "="));

    }

    static clean(startTrack = false) {
        logs = {};
        logSeverity = {
            "errors": 0,
            "warning": 0,
            "info": 0,
        };
        if (startTrack) {
            Log.track(project.name.toUpperCase());
        }
    }
}

export class Stats {
    static log(name = "") {
        return fs.promises.writeFile(cachePath + SEP + (name || "stats") + ".log.json", JSON.stringify(stats, null, 2));
    }
    static report() {
        return Object.keys(stats).sort().reduce((objEntries, key) => {
            objEntries[key] = stats[key];
            return objEntries;
        }, {});
    }

    static clean() {
        stats = {
            duplication : {},
            bucket: {},
            macroext: {},
            ext: {},
            tag: {}
        };
    }
    static isset(bucket, tag = null) {
        return stats["bucket"][bucket] !== undefined
            && (tag === null || stats["bucket"][bucket][tag] !== undefined);
    }

    static skip(bucket) {
        if (stats["duplication"][bucket] === undefined) {
            stats["duplication"][bucket] = 1;
        } else {
            stats["duplication"][bucket]++;
        }
    }
    static save(bucket, tag, value) {

        if (stats["bucket"][bucket] === undefined) {
            stats["bucket"][bucket] = {...stats["bucket"][bucket.replace(".min.", ".")] || {}};
        }

        //da verificare se da problemi
        if (stats["bucket"][value] !== undefined) {
            //value = stats[value];
        }

        if (stats["bucket"][bucket][tag] === undefined || stats["bucket"][bucket][tag] === -1) {
            stats["bucket"][bucket][tag] = (value === "++" ? 1 : value);
        } else if(value === "++") {
            stats["bucket"][bucket][tag] += 1;
        } else if(Array.isArray(stats["bucket"][bucket][tag])) {
            stats["bucket"][bucket][tag].push(value);
        } else if(stats["bucket"][bucket][tag] === value) {
            Stats.skip(bucket);
        } else {
            stats["bucket"][bucket][tag] = [stats["bucket"][bucket][tag], value];
        }

        const ext = (bucket.indexOf(".min.") > 0 ? ".min" : "") + path.extname(bucket) || '';
        if (stats["ext"][ext] === undefined) {
            stats["ext"][ext] = [bucket];
        } else if(!stats["ext"][ext].includes(bucket)) {
            stats["ext"][ext].push(bucket);
        }

        if(MACRO_EXT[ext] !== undefined) {
            if (stats["macroext"][MACRO_EXT[ext]] === undefined) {
                stats["macroext"][MACRO_EXT[ext]] = [bucket];
            } else if(!stats["macroext"][MACRO_EXT[ext]].includes(bucket)) {
                stats["macroext"][MACRO_EXT[ext]].push(bucket);
            }
        }

        if (stats["tag"][tag] === undefined) {
            stats["tag"][tag] = [bucket];
        } else if(!stats["tag"][tag].includes(bucket)) {
            stats["tag"][tag].push(bucket);
        }
    }
    static geAll(key = null) {
        return (key
            ? stats[key] ?? {}
            : stats
        );
    }
    static get(bucket, tag = null) {
        let context = null;
        if (stats["bucket"][bucket] !== undefined) {
            context = "bucket";
        } else if(stats["tag"][bucket] !== undefined) {
            context = "tag";
        } else if(stats["macroext"][bucket] !== undefined) {
            context = "macroext";
        } else if(stats["ext"][bucket] !== undefined) {
            context = "ext";
        }

        if (context) {
            if (tag === null) {
                return stats[context][bucket];
            } else if(stats[context][bucket][tag] !== undefined) {
                return stats[context][bucket][tag];
            }
        }

        return null;
    }
    static diff(object, tag = null) {
        Object.keys(object).forEach((bucket) => {
            if (stats["bucket"][bucket] !== undefined
                && (tag === null || stats["bucket"][bucket][tag] !== undefined)
            ) {
                delete object[tag];
            }
        });

        return object;
    }

    static diffKeys(array, tag = null) {
        let diff = [];
        array.forEach((bucket) => {
            if (stats["bucket"][bucket] === undefined
                || (tag !== null && stats["bucket"][bucket][tag] === undefined)
            ) {
                diff.push(bucket);
            }
        });

        return diff;
    }
}